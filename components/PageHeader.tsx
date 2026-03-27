"use client";

import { Typography, Space, Breadcrumb } from "antd";
import type { ReactNode } from "react";
import Link from "next/link";

const { Title } = Typography;

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  breadcrumbs?: BreadcrumbItem[];
  extra?: ReactNode;
}

export default function PageHeader({
  title,
  breadcrumbs,
  extra,
}: PageHeaderProps) {
  return (
    <div style={{ marginBottom: 24 }}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb
          style={{ marginBottom: 8 }}
          items={breadcrumbs.map((item) => ({
            title: item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              item.label
            ),
          }))}
        />
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Title level={3} style={{ marginBottom: 0 }}>
          {title}
        </Title>
        {extra && <Space>{extra}</Space>}
      </div>
    </div>
  );
}
