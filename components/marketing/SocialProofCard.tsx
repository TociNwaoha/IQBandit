interface SocialProofCardProps {
  quote: string;
  name: string;
  role: string;
  initials: string;
}

export default function SocialProofCard({
  quote,
  name,
  role,
  initials,
}: SocialProofCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Star rating */}
      <div className="flex gap-0.5 mb-4">
        {[...Array(5)].map((_, i) => (
          <svg
            key={i}
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="#111827"
            aria-hidden="true"
          >
            <path d="M7 1l1.545 3.09L12 4.636l-2.5 2.455.59 3.454L7 8.91l-3.09 1.635L4.5 7.09 2 4.636l3.455-.546L7 1z" />
          </svg>
        ))}
      </div>

      {/* Quote */}
      <p className="text-gray-700 text-sm leading-relaxed mb-6">
        &ldquo;{quote}&rdquo;
      </p>

      {/* Author */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{name}</p>
          <p className="text-xs text-gray-500">{role}</p>
        </div>
      </div>
    </div>
  );
}
