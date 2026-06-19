import os
import csv
import re
import sys
from datetime import datetime
from sqlalchemy.orm import Session

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import SessionLocal
from app.models import Transaction, ImportPlanRule, Category

def parse_csv_amount(value: str, negate: bool = True) -> float:
    if not value or value.strip() == '':
        return 0.0
    clean_value = re.sub(r'[^\d.,-]', '', value)
    if ',' in clean_value:
        clean_value = clean_value.replace(',', '.')
    parsed_val = float(clean_value)
    return -parsed_val if negate else parsed_val

def parse_csv_date(value: str):
    value = value.strip()
    for fmt in ('%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Could not parse date: {value}")

def main():
    db = SessionLocal()
    try:
        # 1. Sum of all transactions in DB (excluding Splits)
        db_total = db.query(Transaction).filter(Transaction.account_id == 23).join(Category).filter(Category.name != "Split").all()
        db_sum = sum(tx.amount for tx in db_total)
        print(f"Total transactions in DB for account 23: {len(db_total)}")
        print(f"Total sum of transactions in DB: {db_sum:.2f}")

        # Group by entry date (today vs historical)
        from datetime import timezone
        today_start = datetime(2026, 6, 11, 0, 0, 0, tzinfo=timezone.utc)
        today_db = [tx for tx in db_total if tx.entry >= today_start]
        hist_db = [tx for tx in db_total if tx.entry < today_start]
        
        print(f"Today's DB transactions count: {len(today_db)}, sum: {sum(tx.amount for tx in today_db):.2f}")
        print(f"Historical DB transactions count: {len(hist_db)}, sum: {sum(tx.amount for tx in hist_db):.2f}")

        # 2. Parse rules to know what is ignored
        rules = db.query(ImportPlanRule).filter(ImportPlanRule.import_plan_id == 5).order_by(ImportPlanRule.order.asc()).all()

        # Helper to process CSV file
        def process_csv(path):
            non_ignored = []
            ignored = []
            with open(path, mode='r', encoding='utf-8') as f:
                reader = csv.reader(f)
                headers = [h.strip() for h in next(reader)]
                header_map = {h.lower(): i for i, h in enumerate(headers)}
                
                date_idx = header_map['transaction cleared date']
                desc_idx = header_map['transaction description']
                amount_idx = header_map['transaction amount']

                for row_idx, row in enumerate(reader, start=2):
                    if not row or all(cell.strip() == '' for cell in row):
                        continue
                    
                    try:
                        date_val = parse_csv_date(row[date_idx])
                        amount_val = parse_csv_amount(row[amount_idx], negate=True)
                        desc_val = row[desc_idx].strip()
                    except Exception as ex:
                        continue

                    if amount_val == 0.0:
                        continue

                    # Rules matching
                    is_ignored = False
                    for rule in rules:
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

                    sig = (date_val, amount_val, desc_val)
                    if is_ignored:
                        ignored.append(sig)
                    else:
                        non_ignored.append(sig)
            return non_ignored, ignored

        # Process the files
        h_non, h_ign = process_csv("/Users/jb/Documents/code/finance-app/csv/halifax_all_transactions.csv")
        o_non, o_ign = process_csv("/Users/jb/Documents/code/finance-app/csv/0373_10062026.csv")

        print(f"\nhalifax_all_transactions.csv:")
        print(f"  - Non-ignored rows: {len(h_non)}, sum of amounts: {sum(x[1] for x in h_non):.2f}")
        print(f"  - Ignored rows: {len(h_ign)}, sum of amounts: {sum(x[1] for x in h_ign):.2f}")
        print("  - Ignored rows sample (first 10):")
        for x in h_ign[:10]:
            print(f"    {x[0]} | {x[1]:.2f} | {x[2]}")
        print("  - Ignored rows with amounts < 100 or non-standard (all):")
        for x in h_ign:
            if abs(x[1]) < 1000: # print smaller ones to see if there's any anomaly around 55.15
                print(f"    {x[0]} | {x[1]:.2f} | {x[2]}")

        print(f"\n0373_10062026.csv:")
        print(f"  - Non-ignored rows: {len(o_non)}, sum of amounts: {sum(x[1] for x in o_non):.2f}")
        print(f"  - Ignored rows: {len(o_ign)}, sum of amounts: {sum(x[1] for x in o_ign):.2f}")

        print(f"\nComparing Ignored Payments in CSV with Transfers in DB:")
        # Find all transfers in DB
        db_transfers = (
            db.query(Transaction)
            .filter(Transaction.account_id == 23)
            .join(Category)
            .filter(Category.name == "Transfer")
            .order_by(Transaction.cash.desc())
            .all()
        )
        
        print(f"Total transfers in DB: {len(db_transfers)}")
        print(f"Total ignored payments in CSV: {len(h_ign)}")

        # Match them by closest date and amount
        used_txs = set()
        matched_count = 0
        unmatched_csv = []
        
        for csv_date, csv_amount, csv_desc in h_ign:
            # Look for matching db transfer
            # CSV amount is positive in csv_amount (because of parse_csv_amount(negate=True) negating the negative value)
            matched_tx = None
            for tx in db_transfers:
                if tx.transaction_id in used_txs:
                    continue
                # Match if amount is close (within 0.01) and date is within 3 days
                if abs(tx.amount - csv_amount) < 0.02 and abs((tx.cash - csv_date).days) <= 3:
                    matched_tx = tx
                    break
            
            if matched_tx:
                used_txs.add(matched_tx.transaction_id)
                matched_count += 1
            else:
                unmatched_csv.append((csv_date, csv_amount, csv_desc))

        print(f"Successfully matched: {matched_count} / {len(h_ign)}")
        if unmatched_csv:
            print("Unmatched CSV payments:")
            for item in unmatched_csv:
                print(f"  {item[0]} | {item[1]:.2f} | {item[2]}")
        
        unmatched_db = [tx for tx in db_transfers if tx.transaction_id not in used_txs]
        if unmatched_db:
            print("Unmatched DB transfers:")
            for tx in unmatched_db:
                print(f"  {tx.cash} | {tx.amount:.2f} | {tx.comment}")
                
    finally:
        db.close()

if __name__ == '__main__':
    main()
