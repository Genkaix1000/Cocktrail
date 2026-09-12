import { env } from "@/config/env";
import { supabase } from "@/shared/supabase";

async function main() {
  console.log(`[set-brand] Actualizando branding a miBoliche en: ${env.SUPABASE_URL}`);

  const updateData = {
    brand_name: "miBoliche",
    logo_url: "/miboliche-horizontal.svg",
    club_id: "miboliche_demo",
    club_name: "miBoliche",
    text_logo_value: "miBoliche",
    theme: "bosko",
    use_logo_url: true,
    logo_size: 140,
    text_logo_size: 24,
  };

  const { data, error } = await supabase
    .from("app_config")
    .upsert({
      id: "default",
      ...updateData,
    })
    .select()
    .single();

  if (error) {
    console.error("[set-brand] ❌ Error actualizando app_config:", error);
    process.exit(1);
  }

  console.log("[set-brand] ✅ Branding actualizado a miBoliche con éxito:", data);
}

main().catch((err) => {
  console.error("[set-brand] ❌ Error:", err);
  process.exit(1);
});
