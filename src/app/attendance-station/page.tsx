import { DeviceDisplay } from "@/features/attendance/device-display";
export const metadata = {
  title: "Asistencia · Mecanismos",
  robots: { index: false, follow: false },
};
export default function AttendanceStationPage() {
  return <DeviceDisplay />;
}
