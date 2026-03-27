"use client";

import { Table, Input } from "antd";
import type { TableProps } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useState, useMemo } from "react";

interface DataTableProps<T extends object> extends TableProps<T> {
  searchPlaceholder?: string;
  searchFields?: (keyof T)[];
}

export default function DataTable<T extends object>({
  searchPlaceholder = "Tìm kiếm...",
  searchFields,
  dataSource,
  ...tableProps
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");

  const filteredData = useMemo(() => {
    if (!search || !searchFields || !dataSource) return dataSource;
    const lower = search.toLowerCase();
    return dataSource.filter((row) =>
      searchFields.some((field) => {
        const val = row[field];
        return val != null && String(val).toLowerCase().includes(lower);
      }),
    );
  }, [search, searchFields, dataSource]);

  return (
    <div>
      {searchFields && (
        <Input
          prefix={<SearchOutlined />}
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          style={{ marginBottom: 16, maxWidth: 360 }}
        />
      )}
      <Table<T>
        dataSource={filteredData}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `Tổng ${total}` }}
        {...tableProps}
      />
    </div>
  );
}
