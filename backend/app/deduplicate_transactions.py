import os
import csv
import re
import sys
from datetime import datetime, date
from sqlalchemy.orm import Session

# Add the parent directory to the path so we can import app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal
from app.models import Transaction, ImportPlanRule, ImportCsvField

CSV_FILE_PATH = "/Users/jb/Documents/code/finance-app/csv/halifax_all_transactions.csv"
ACCOUNT_ID = 23
IMPORT_PLAN_ID = 5


def parse_csv_amount(value: str, negate: bool = True) -> float:
    if not value or value.strip() == '':
        return 0.0
    clean_value = re.sub(r'[^\d.,-]', '', value)
    if ',' in clean_value:
        clean_value = clean_value.replace(',', '.')
    parsed_val = float(clean_value)
    return -parsed_val if negate else parsed_val


def parse_csv_date(value: str) -> date:
    # Supports DD/MM/YYYY or DD-MM-YYYY
    value = value.strip()
    for fmt in ('%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Could not parse date: {value}")


def run_cleanup(dry_run: bool = True):
    db: Session = SessionLocal()
    try:
        # 1. Load import rules for matching/ignoring
        print(f"Loading rules for Import Plan ID {IMPORT_PLAN_ID}...")
        rules = (
            db.query(ImportPlanRule)
            .filter(ImportPlanRule.import_plan_id == IMPORT_PLAN_ID)
            .order_by(ImportPlanRule.order.asc())
            .all()
        )
        print(f"Loaded {len(rules)} rules.")

        # 2. Parse the CSV file
        print(f"Parsing CSV file from {CSV_FILE_PATH}...")
        expected_transactions = []
        ignored_count = 0

        with open(CSV_FILE_PATH, mode='r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = [h.strip() for h in next(reader)]
            
            # Map header names to indices
            header_map = {h.lower(): i for i, h in enumerate(headers)}
            
            # Identify columns based on template
            # For halifax:
            # - 'Transaction Cleared Date' -> mapped to DATE (cash date)
            # - 'Transaction Description' -> COMMENTS (comment)
            # - 'Transaction Amount' -> -AMOUNT
            cleared_date_col = 'transaction cleared date'
            description_col = 'transaction description'
            amount_col = 'transaction amount'

            if cleared_date_col not in header_map or description_col not in header_map or amount_col not in header_map:
                print("Error: Missing required columns in CSV headers.", headers)
                return

            date_idx = header_map[cleared_date_col]
            desc_idx = header_map[description_col]
            amount_idx = header_map[amount_col]

            for row_idx, row in enumerate(reader, start=2):
                if not row or all(cell.strip() == '' for cell in row):
                    continue
                
                try:
                    date_val = parse_csv_date(row[date_idx])
                    amount_val = parse_csv_amount(row[amount_idx], negate=True)
                    desc_val = row[desc_idx].strip()
                except Exception as ex:
                    print(f"Error parsing row {row_idx}: {row}. Error: {ex}")
                    continue

                if amount_val == 0.0:
                    continue

                # Apply import rules to see if ignored
                is_ignored = False
                for rule in rules:
                    # Find field value
                    field_name = rule.import_csv_field.name.lower()
                    if field_name not in header_map:
                        continue
                    field_val = row[header_map[field_name]]

                    is_equals = rule.match_type == 'equals'
                    if is_equals:
                        matches = field_val.lower().strip() == rule.pattern.lower().strip()
                    else:
                        matches = rule.pattern.lower() in field_val.lower()

                    if matches:
                        if rule.ignore:
                            is_ignored = True
                        break

                if is_ignored:
                    ignored_count += 1
                    continue

                # Signature is (cash_date, amount, comment)
                sig = (date_val, amount_val, desc_val)
                expected_transactions.append(sig)

        print(f"CSV parsing complete. Expected {len(expected_transactions)} transactions (Ignored: {ignored_count}).")

        # Create signature frequency map from CSV
        csv_sig_counts = {}
        for sig in expected_transactions:
            csv_sig_counts[sig] = csv_sig_counts.get(sig, 0) + 1

        # 3. Query transactions in the database created today (2026-06-11)
        today_start = datetime(2026, 6, 11, 0, 0, 0)
        db_txs = (
            db.query(Transaction)
            .filter(Transaction.account_id == ACCOUNT_ID)
            .filter(Transaction.entry >= today_start)
            .all()
        )
        print(f"Found {len(db_txs)} transactions in DB created today.")

        # Group database transactions by signature
        db_sig_txs = {}
        for tx in db_txs:
            sig = (tx.cash, tx.amount, tx.comment)
            if sig not in db_sig_txs:
                db_sig_txs[sig] = []
            db_sig_txs[sig].append(tx)

        # 4. Determine excess transactions to delete
        to_delete_ids = []
        kept_count = 0
        not_found_in_csv = 0

        for sig, tx_list in db_sig_txs.items():
            expected_count = csv_sig_counts.get(sig, 0)
            actual_count = len(tx_list)

            # Sort by transaction_id ascending so we keep the first one(s) created
            tx_list.sort(key=lambda t: t.transaction_id)

            if expected_count == 0:
                print(f"Warning: Signature {sig} found in DB ({actual_count} times) but NOT in CSV. Deleting all of them.")
                not_found_in_csv += actual_count
                for tx in tx_list:
                    to_delete_ids.append(tx.transaction_id)
            elif actual_count > expected_count:
                # Keep the first expected_count items, delete the rest
                kept_count += expected_count
                excess_count = actual_count - expected_count
                for tx in tx_list[expected_count:]:
                    to_delete_ids.append(tx.transaction_id)
            else:
                # actual_count <= expected_count, keep all
                kept_count += actual_count

        print(f"Analysis results:")
        print(f"  - Kept count: {kept_count}")
        print(f"  - Deleting {len(to_delete_ids)} excess duplicate transactions.")
        if not_found_in_csv > 0:
            print(f"  - Deleting {not_found_in_csv} transactions that were not found in the CSV plan.")

        # 5. Perform deletion
        if len(to_delete_ids) > 0:
            if dry_run:
                print(f"[DRY RUN] Would delete {len(to_delete_ids)} transaction IDs: {to_delete_ids[:20]}...")
            else:
                print(f"Deleting {len(to_delete_ids)} transactions from the database...")
                # Delete in chunks to prevent large query issues
                chunk_size = 500
                for i in range(0, len(to_delete_ids), chunk_size):
                    chunk = to_delete_ids[i:i + chunk_size]
                    db.query(Transaction).filter(Transaction.transaction_id.in_(chunk)).delete(synchronize_session=False)
                
                db.commit()
                print("✔ Deletion successfully committed.")
        else:
            print("No excess duplicate transactions found to delete.")

    except Exception as e:
        db.rollback()
        print(f"Error during cleanup execution: {e}")
        raise e
    finally:
        db.close()


if __name__ == "__main__":
    is_dry_run = "--commit" not in sys.argv
    if is_dry_run:
        print("Running in DRY-RUN mode. Use --commit to apply database changes.")
    else:
        print("Running in COMMIT mode. Changes will be saved to the database.")
    run_cleanup(dry_run=is_dry_run)
