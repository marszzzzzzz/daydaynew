import { SectionTitle } from "../ui";
import WeeklyReport from "@/components/WeeklyReport";

export default function WeeklyTab() {
  return (
    <div>
      <SectionTitle
        no="09 · Weekly"
        title="週結報表"
        desc="星期一至日嘅銷售結算：逐格仔、逐日、店舖直銷分開列示，方便同租戶對數。"
      />
      <WeeklyReport />
    </div>
  );
}
