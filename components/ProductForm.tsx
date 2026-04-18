"use client";

import { useEffect, useState } from "react";
import { Form, Button, Space, Divider, Row, Col, message, Card } from "antd";
import { MinusCircleOutlined, PlusOutlined } from "@ant-design/icons";
import FormField from "./FormField";
import type { Product } from "@/lib/types/product";

interface ProductFormProps {
  initialData?: Product;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function ProductForm({ initialData, onSuccess, onCancel }: ProductFormProps) {
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
      // Find BrandName and CategoryName for backend structure if needed
      const brand = brands.find((b: any) => b.BrandId === values.BrandId) as any;
      const category = categories.find((c: any) => c.CategoryId === values.CategoryId) as any;

      const payload = {
        ...values,
        BrandName: brand?.BrandName,
        CategoryName: category?.CategoryName,
      };

      const url = initialData ? `/api/products/${initialData.ProductId}` : "/api/products";
      const method = initialData ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        message.success(initialData ? "Cập nhật thành công" : "Thêm mới thành công");
        onSuccess();
      } else {
        const err = await res.json();
        message.error(err.error || "Có lỗi xảy ra");
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
                      <Col span={12}>
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
                      <Col span={12}>
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

      <Space style={{ marginTop: 24, display: "flex", justifyContent: "flex-end" }}>
        <Button onClick={onCancel}>Hủy</Button>
        <Button type="primary" htmlType="submit" loading={loading}>
          {initialData ? "Cập nhật" : "Lưu sản phẩm"}
        </Button>
      </Space>
    </Form>
  );
}
