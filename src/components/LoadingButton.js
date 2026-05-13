"use client";

export default function LoadingButton({ isLoading, children, spinnerSize = "sm", disabled, ...props }) {
  return (
    <button disabled={isLoading || disabled} {...props}>
      {isLoading ? <span className={`spinner-${spinnerSize}`} /> : children}
    </button>
  );
}
