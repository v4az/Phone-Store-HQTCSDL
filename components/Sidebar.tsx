"use client";

import { Layout, Menu } from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

const { Sider } = Layout;

export default function Sidebar() {
  const pathname = usePathname();

  const menuItems = [
    {
      key: "/",
      icon: <DashboardOutlined />,
      label: <Link href="/">Dashboard</Link>,
    },
    {
      key: "/products",
      icon: <AppstoreOutlined />,
      label: <Link href="/products">Products</Link>,
    },
    {
      key: "/inventory",
      icon: <InboxOutlined />,
      label: <Link href="/inventory">Inventory</Link>,
    },
    {
      key: "/sales/new",
      icon: <ShoppingCartOutlined />,
      label: <Link href="/sales/new">New Sale</Link>,
    },
  ];

  return (
    <Sider
      breakpoint="lg"
      collapsedWidth="0"
      theme="dark"
      style={{
        height: "100vh",
        position: "sticky",
        top: 0,
        left: 0,
        zIndex: 100,
      }}
    >
      <div
        className="p-4"
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: 64,
          margin: 16,
          background: "rgba(255, 255, 255, 0.2)",
          borderRadius: 6,
          color: "white",
          fontWeight: "bold",
          fontSize: "1.2rem",
        }}
      >
        CSDL Admin
      </div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[pathname]}
        items={menuItems}
      />
    </Sider>
  );
}
