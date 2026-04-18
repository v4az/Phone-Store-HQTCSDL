"use client";

import { useEffect, useState } from "react";
import { Form, Button, Card, Row, Col, Typography, App, Select, InputNumber, Divider, Input } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import FormField from "./FormField";

const { Title, Text } = Typography;

export default function SaleForm() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  
  // Track dynamic totals
  const [subtotal, setSubtotal] = useState(0);
  const [totalAfterLineDiscount, setTotalAfterLineDiscount] = useState(0);
  const [invoiceDiscount, setInvoiceDiscount] = useState(0);

  useEffect(() => {
    async function fetchProducts() {
      const res = await fetch("/api/products?include=variants");
      if (res.ok) setProducts(await res.json());
    }
    fetchProducts();
  }, []);

  // Build options for product variants with available stock
  const variantOptions = products.flatMap((p: any) =>
    p.Variants.map((v: any) => ({
      label: `${p.ProductName} - ${v.Color || ''} ${v.Storage || ''} [SKU: ${v.Sku}] (Kho: ${v.QuantityOnHand ?? 0})`,
      value: v.VariantId,
      price: v.RetailPrice,
      productName: p.ProductName,
      available: v.QuantityOnHand ?? 0,
      disabled: (v.QuantityOnHand ?? 0) <= 0,
    }))
  );

  const calculateTotals = () => {
    const values = form.getFieldsValue();
    const lines = values.Lines || [];
    let rawSubtotal = 0;
    let discountedTotal = 0;

    lines.forEach((line: any, index: number) => {
      if (line && line.VariantId && line.Quantity) {
        const variant = variantOptions.find(v => v.value === line.VariantId);
        if (variant) {
          const unitPrice = Number(variant.price);
          const qty = Number(line.Quantity) || 0;
          const discountPct = Number(line.DiscountPct) || 0;

          rawSubtotal += unitPrice * qty;
          discountedTotal += (unitPrice * qty) * (1 - discountPct / 100);

          // Auto-update unit price for display
          const currentUnitPrice = form.getFieldValue(['Lines', index, 'UnitPrice']);
          if (!currentUnitPrice) {
            form.setFieldValue(['Lines', index, 'UnitPrice'], unitPrice);
          }
        }
      }
    });

    setSubtotal(rawSubtotal);
    setTotalAfterLineDiscount(discountedTotal);
    const disc = Number(values.DiscountAmount) || 0;
    setInvoiceDiscount(disc);
  };

  const onFinish = async (values: any) => {
    if (!values.Lines || values.Lines.length === 0) {
      message.error("Vui lòng thêm ít nhất một sản phẩm");
      return;
    }
    setLoading(true);
    try {
      const finalLines = (values.Lines || []).map((line: any, idx: number) => {
        const variant = variantOptions.find(v => v.value === line.VariantId);
        const unitPrice = Number(line.UnitPrice || variant?.price || 0);
        const discountPct = Number(line.DiscountPct || 0);
        const qty = Number(line.Quantity || 0);
        const lineTotal = (unitPrice * qty) * (1 - discountPct / 100);
        
        return {
          LineNo: idx + 1,
          VariantId: line.VariantId,
          Quantity: qty,
          UnitPrice: unitPrice,
          DiscountPct: discountPct,
          LineTotal: lineTotal
        };
      });

      const total = finalLines.reduce((acc: number, cur: any) => acc + (cur.UnitPrice * cur.Quantity), 0);
      const invoiceDiscount = Number(values.DiscountAmount) || 0;
      const finalAmount = finalLines.reduce((acc: number, cur: any) => acc + cur.LineTotal, 0) - invoiceDiscount;

      const payload = {
        InvoiceCode: `INV-${Date.now()}`,
        CustomerId: null, // Simple version: no customer management yet
        InvoiceDate: new Date().toISOString(),
        TotalAmount: total,
        DiscountAmount: invoiceDiscount,
        FinalAmount: finalAmount,
        LocationId: 1, // Default store location
        Lines: finalLines
      };

      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        message.success("Tạo đơn hàng thành công");
        router.push("/");
      } else if (res.status === 409) {
        const err = await res.json();
        message.error(`Lỗi tồn kho: ${err.error}`);
      } else {
        const err = await res.json();
        message.error(err.error || "Có lỗi xảy ra khi tạo đơn hàng");
      }
    } catch (error) {
      console.error(error);
      message.error("Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const formatter = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" });

  return (
    <Card variant="borderless">
      <Form
        form={form}
        layout="vertical"
        onFinish={onFinish}
        onValuesChange={calculateTotals}
        initialValues={{ Lines: [{}] }}
      >
        <Row gutter={24}>
          <Col span={16}>
            <Title level={5}>Sản phẩm đơn hàng</Title>
            <Form.List name="Lines">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(({ key, name, ...restField }) => (
                    <Row gutter={16} key={key} style={{ marginBottom: 16 }} align="bottom">
                      <Col span={10}>
                        <Form.Item
                          {...restField}
                          name={[name, "VariantId"]}
                          label="Sản phẩm"
                          rules={[{ required: true, message: "Chọn SP" }]}
                          style={{ marginBottom: 0 }}
                        >
                          <Select
                            showSearch
                            placeholder="Chọn phiên bản SP"
                            options={variantOptions}
                            optionFilterProp="label"
                          />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item noStyle dependencies={[["Lines", name, "VariantId"]]}>
                          {() => {
                            const selectedVariantId = form.getFieldValue(["Lines", name, "VariantId"]);
                            const variant = variantOptions.find((v: any) => v.value === selectedVariantId);
                            const maxQty = variant?.available ?? 0;
                            return (
                              <Form.Item
                                {...restField}
                                name={[name, "Quantity"]}
                                label={`Số lượng (tối đa: ${maxQty})`}
                                rules={[
                                  { required: true, message: "Nhập SL" },
                                  {
                                    validator: async (_, value) => {
                                      if (value && Number(value) > maxQty) {
                                        return Promise.reject(new Error(`Tối đa ${maxQty}`));
                                      }
                                    }
                                  }
                                ]}
                                style={{ marginBottom: 0 }}
                              >
                                <InputNumber min={1} max={maxQty || undefined} style={{ width: "100%" }} />
                              </Form.Item>
                            );
                          }}
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, "DiscountPct"]}
                          label="Giảm giá (%)"
                          rules={[
                            { pattern: /^\d+(\.\d+)?$/, message: "Phải là số hợp lệ" },
                            { 
                              validator: async (_, value) => {
                                if (value && (Number(value) < 0 || Number(value) > 100)) {
                                  return Promise.reject(new Error("0-100%"));
                                }
                              }
                            }
                          ]}
                          style={{ marginBottom: 0 }}
                        >
                          <Input style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                      <Col span={4}>
                        <Form.Item
                          {...restField}
                          name={[name, "UnitPrice"]}
                          label="Đơn giá"
                          style={{ marginBottom: 0 }}
                        >
                          <InputNumber disabled style={{ width: "100%" }} formatter={(value) => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                        </Form.Item>
                      </Col>
                      <Col span={2}>
                        {fields.length > 1 && (
                          <Button danger type="text" icon={<DeleteOutlined />} onClick={() => remove(name)} />
                        )}
                      </Col>
                    </Row>
                  ))}
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 16 }}>
                    Thêm sản phẩm
                  </Button>
                </>
              )}
            </Form.List>
          </Col>
          
          <Col span={8}>
            <Card title="Thanh toán" size="small" style={{ background: "#fafafa" }}>
              <FormField
                name="DiscountAmount"
                label="Giảm giá tổng đơn (VNĐ)"
                fieldType="number"
              />
              
              <Divider style={{ margin: "12px 0" }} />
              
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <Text>Tổng cộng:</Text>
                <Text strong>{formatter.format(subtotal)}</Text>
              </div>
              {subtotal - totalAfterLineDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text>Giảm giá SP:</Text>
                  <Text type="danger">-{formatter.format(subtotal - totalAfterLineDiscount)}</Text>
                </div>
              )}
              {invoiceDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text>Giảm giá đơn:</Text>
                  <Text type="danger">-{formatter.format(invoiceDiscount)}</Text>
                </div>
              )}
              <Divider style={{ margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                <Text strong style={{ fontSize: 16 }}>Khách cần trả:</Text>
                <Title level={4} style={{ margin: 0, color: "#1677ff" }}>
                  {formatter.format(Math.max(0, totalAfterLineDiscount - invoiceDiscount))}
                </Title>
              </div>

              <Button type="primary" htmlType="submit" size="large" block loading={loading}>
                Hoàn tất & Tạo đơn hàng
              </Button>
            </Card>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
