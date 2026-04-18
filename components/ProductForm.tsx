"use client";

import { useEffect, useState } from "react";
import { Form, Button, Space, Divider, Row, Col, Card, App, InputNumber, Typography } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import FormField from "./FormField";
import type { Product } from "@/lib/types/product";

const { Text } = Typography;

interface ProductFormProps {
  initialData?: Product;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProductForm({ initialData, onSuccess, onCancel }: ProductFormProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [brands, setBrands] = useState([]);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    Promise.all([fetch("/api/brands"), fetch("/api/categories")]).then(
      async ([brandsRes, catRes]) => {
        if (brandsRes.ok) setBrands(await brandsRes.json());
        if (catRes.ok) setCategories(await catRes.json());
      }
    );
  }, []);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const brand = brands.find((b: any) => b.BrandId === values.BrandId) as any;
      const category = categories.find((c: any) => c.CategoryId === values.CategoryId) as any;

      if (initialData) {
        // Edit mode: update product info + inventory
        const payload = {
          ...values,
          BrandName: brand?.BrandName,
          CategoryName: category?.CategoryName,
          // Send inventory updates for each variant
          InventoryUpdates: initialData.Variants.map((v, i) => ({
            VariantId: v.VariantId,
            QuantityOnHand: values.Variants?.[i]?.QuantityOnHand ?? v.QuantityOnHand ?? 0,
          })),
        };
        // Remove Variants from product update payload (variants aren't editable here)
        delete payload.Variants;

        const res = await fetch(`/api/products/${initialData.ProductId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          message.success("Cập nhật thành công");
          onSuccess();
        } else {
          const err = await res.json();
          message.error(err.error || "Có lỗi xảy ra");
        }
      } else {
        // Create mode: send product + variants with initial stock
        const payload = {
          ...values,
          BrandName: brand?.BrandName,
          CategoryName: category?.CategoryName,
        };

        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          message.success("Thêm mới thành công");
          onSuccess();
        } else {
          const err = await res.json();
          message.error(err.error || "Có lỗi xảy ra");
        }
      }
    } catch (error) {
      console.error(error);
      message.error("Có lỗi xảy ra");
    } finally {
      setLoading(false);
    }
  };

  const brandOptions = brands.map((b: any) => ({ label: b.BrandName, value: b.BrandId }));
  const categoryOptions = categories.map((c: any) => ({ label: c.CategoryName, value: c.CategoryId }));

  return (
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        ...initialData,
        IsActive: initialData?.IsActive ?? true,
        Variants: initialData?.Variants || [{}],
      }}
      onFinish={onFinish}
    >
      <Row gutter={16}>
        <Col span={12}>
          <FormField
            name="ProductCode"
            label="Mã sản phẩm"
            rules={[{ required: true, message: "Vui lòng nhập mã SP" }]}
          />
        </Col>
        <Col span={12}>
          <FormField
            name="ProductName"
            label="Tên sản phẩm"
            rules={[{ required: true, message: "Vui lòng nhập tên SP" }]}
          />
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <FormField
            name="BrandId"
            label="Thương hiệu"
            fieldType="select"
            options={brandOptions}
            rules={[{ required: true, message: "Vui lòng chọn thương hiệu" }]}
          />
        </Col>
        <Col span={12}>
          <FormField
            name="CategoryId"
            label="Danh mục"
            fieldType="select"
            options={categoryOptions}
            rules={[{ required: true, message: "Vui lòng chọn danh mục" }]}
          />
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <FormField
            name="WarrantyMonths"
            label="Bảo hành (tháng)"
            fieldType="number"
            rules={[
              { required: true, message: "Vui lòng nhập TG bảo hành" },
              { pattern: /^\d+$/, message: "Phải là số >= 0" }
            ]}
          />
        </Col>
        <Col span={12}>
          <FormField
            name="IsActive"
            label="Trạng thái kinh doanh"
            fieldType="switch"
          />
        </Col>
      </Row>

      <FormField
        name="Description"
        label="Mô tả"
        fieldType="textarea"
      />

      {/* Create mode: editable variant list with initial stock */}
      {!initialData && (
        <>
          <Divider>Phiên bản (Biến thể)</Divider>
          <Form.List name="Variants">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Card size="small" key={key} style={{ marginBottom: 16 }}>
                    <Row gutter={16}>
                      <Col span={8}>
                        <FormField
                          {...restField}
                          name={[name, "Sku"]}
                          label="SKU"
                          rules={[{ required: true, message: "Bắt buộc" }]}
                        />
                      </Col>
                      <Col span={8}>
                        <FormField
                          {...restField}
                          name={[name, "Color"]}
                          label="Màu sắc"
                        />
                      </Col>
                      <Col span={8}>
                        <FormField
                          {...restField}
                          name={[name, "Storage"]}
                          label="Dung lượng"
                        />
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={8}>
                        <FormField
                          {...restField}
                          name={[name, "CostPrice"]}
                          label="Giá vốn"
                          fieldType="number"
                          rules={[
                            { required: true, message: "Bắt buộc" },
                            { pattern: /^\d+(\.\d+)?$/, message: "Phải là số >= 0" }
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <FormField
                          {...restField}
                          name={[name, "RetailPrice"]}
                          label="Giá bán"
                          fieldType="number"
                          rules={[
                            { required: true, message: "Bắt buộc" },
                            { pattern: /^\d+(\.\d+)?$/, message: "Phải là số >= 0" }
                          ]}
                        />
                      </Col>
                      <Col span={8}>
                        <Form.Item
                          {...restField}
                          name={[name, "QuantityOnHand"]}
                          label="Tồn kho ban đầu"
                          initialValue={0}
                        >
                          <InputNumber min={0} style={{ width: "100%" }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    {fields.length > 1 && (
                      <Button
                        type="dashed"
                        danger
                        icon={<MinusCircleOutlined />}
                        onClick={() => remove(name)}
                        style={{ width: "100%" }}
                      >
                        Xóa phiên bản này
                      </Button>
                    )}
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add()}
                  block
                  icon={<PlusOutlined />}
                >
                  Thêm phiên bản
                </Button>
              </>
            )}
          </Form.List>
        </>
      )}

      {/* Edit mode: show existing variants with editable inventory */}
      {initialData && initialData.Variants.length > 0 && (
        <>
          <Divider>Tồn kho theo phiên bản</Divider>
          {initialData.Variants.map((variant, index) => (
            <Card size="small" key={variant.VariantId} style={{ marginBottom: 12 }}>
              <Row gutter={16} align="middle">
                <Col span={6}>
                  <Text strong>SKU:</Text> {variant.Sku}
                </Col>
                <Col span={4}>
                  <Text type="secondary">{variant.Color || "—"}</Text>
                </Col>
                <Col span={4}>
                  <Text type="secondary">{variant.Storage || "—"}</Text>
                </Col>
                <Col span={4}>
                  <Text type="secondary">
                    Đã đặt: {variant.QuantityReserved ?? 0}
                  </Text>
                </Col>
                <Col span={6}>
                  <Form.Item
                    name={["Variants", index, "QuantityOnHand"]}
                    label="Tồn kho"
                    style={{ marginBottom: 0 }}
                  >
                    <InputNumber min={0} style={{ width: "100%" }} />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          ))}
        </>
      )}

      <Space style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={onCancel}>Hủy</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {initialData ? "Cập nhật" : "Lưu sản phẩm"}
        </Button>
      </Space>
    </Form>
  );
}
