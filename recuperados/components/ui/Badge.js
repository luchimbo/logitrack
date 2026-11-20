const colorMap = {
  default: "badge-default",
  primary: "badge-primary",
  success: "badge-success",
  warning: "badge-warning",
  danger: "badge-danger",
  info: "badge-info",
};

export default function Badge({
  children,
  variant = "default",
  className = "",
  ...props
}) {
  return (
    <span
      className={`badge ${colorMap[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
