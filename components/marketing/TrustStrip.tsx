const COMPANIES = [
  "Acme Corp",
  "Velocity AI",
  "NovaTech",
  "Pulsara",
  "Synapse Labs",
  "DropBase",
];

export default function TrustStrip() {
  return (
    <div className="border-y border-gray-100 py-10 px-4">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-8">
          Trusted by AI teams worldwide
        </p>
        <div className="flex flex-wrap justify-center gap-x-10 gap-y-4">
          {COMPANIES.map((name) => (
            <span
              key={name}
              className="text-sm font-bold text-gray-200 hover:text-gray-400 transition-colors cursor-default select-none"
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
