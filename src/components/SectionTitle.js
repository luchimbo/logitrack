import AppIcon from "@/components/AppIcon";

export default function SectionTitle({ children, icon }) {
  return (
    <div className="section-title-row">
      <span className="section-title-icon" aria-hidden="true"><AppIcon name={icon} size={20} /></span>
      <h1 className="section-title">{children}</h1>
    </div>
  );
}
