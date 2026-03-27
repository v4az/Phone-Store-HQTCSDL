"use client";

import {
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  type FormItemProps,
} from "antd";

type FieldType = "text" | "number" | "password" | "textarea" | "select" | "switch";

export interface SelectOption {
  label: string;
  value: string | number;
}

interface FormFieldProps extends FormItemProps {
  fieldType?: FieldType;
  placeholder?: string;
  options?: SelectOption[];
}

export default function FormField({
  fieldType = "text",
  placeholder,
  options,
  ...formItemProps
}: FormFieldProps) {
  const renderInput = () => {
    switch (fieldType) {
      case "number":
        return (
          <InputNumber
            placeholder={placeholder}
            style={{ width: "100%" }}
          />
        );
      case "password":
        return <Input.Password placeholder={placeholder} />;
      case "textarea":
        return <Input.TextArea placeholder={placeholder} rows={3} />;
      case "select":
        return (
          <Select
            placeholder={placeholder}
            options={options}
            allowClear
            showSearch
            optionFilterProp="label"
          />
        );
      case "switch":
        return <Switch />;
      default:
        return <Input placeholder={placeholder} />;
    }
  };

  return (
    <Form.Item
      {...formItemProps}
      valuePropName={fieldType === "switch" ? "checked" : "value"}
    >
      {renderInput()}
    </Form.Item>
  );
}
