interface Stat {
  value: string;
  label: string;
}

const STATS: Stat[] = [
  { value: "10,000+", label: "Agents deployed" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "< 50ms", label: "Avg. response time" },
  { value: "3 channels", label: "Supported platforms" },
];

export default function StatsRow() {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/*
       * Contained card approach:
       * – subtle gray-50 fill, hairline border, rounded-2xl
       * – grid with responsive divide lines using the gap-px/bg technique
       */}
      <div className="rounded-2xl border border-gray-100 overflow-hidden">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-100">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="bg-white px-6 sm:px-10 py-9 text-center"
            >
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 tracking-tight mb-1.5 tabular-nums">
                {stat.value}
              </p>
              <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
