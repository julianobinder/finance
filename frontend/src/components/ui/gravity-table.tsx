import * as React from 'react';
import { Table as OriginalTable, TableProps } from '@gravity-ui/uikit';

export function Table<T>(props: TableProps<T>) {
  const safeColumns = React.useMemo(() => {
    return props.columns?.map((col) => ({
      placeholder: '',
      ...col,
    }));
  }, [props.columns]);

  return <OriginalTable width="max" {...props} columns={safeColumns} />;
}
