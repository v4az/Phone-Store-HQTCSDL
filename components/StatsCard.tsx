"use client";

import { Card, Statistic } from "antd";
import type { ReactNode } from "react";

interface StatsCardProps {
  title: string;
  value: number | string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  loading?: boolean;
}

export default function StatsCard({
  title,
  value,
  prefix,
  suffix,
  loading,
}: StatsCardProps) {
  return (
    <Card variant="borderless" style={{ height: "100%" }}>
      <Statistic
        title={title}
        value={value}
        prefix={prefix}
        suffix={suffix}
        loading={loading}
      />
    </Card>
  );
}
