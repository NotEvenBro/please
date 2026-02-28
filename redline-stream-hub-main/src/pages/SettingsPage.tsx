import Layout from "@/components/streaming/Layout";

export default function SettingsPage() {
  return (
    <Layout>
      <div className="pt-[var(--nav-height)] tv-safe pb-16">
        <h1 className="text-3xl font-black text-foreground mt-6 mb-6">Settings</h1>
        <div className="max-w-lg space-y-6">
          {[
            { label: "Server URL", value: "http://localhost:8096" },
            { label: "User", value: "admin" },
            { label: "Playback Quality", value: "Auto" },
          ].map((setting) => (
            <div key={setting.label} className="flex items-center justify-between p-4 rounded-md bg-card">
              <span className="text-sm font-medium text-foreground">{setting.label}</span>
              <span className="text-sm text-muted-foreground">{setting.value}</span>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
