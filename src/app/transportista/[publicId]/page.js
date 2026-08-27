import CarrierPortalClient from "@/components/CarrierPortalClient";

export const metadata = {
  title: "Operación de transporte",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function CarrierPortalPage({ params }) {
  const { publicId } = await params;
  return <CarrierPortalClient publicId={publicId} />;
}
