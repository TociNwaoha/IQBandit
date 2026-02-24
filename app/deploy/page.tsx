import MarketingNav from "@/components/marketing/MarketingNav";
import HeroDeploy from "@/components/marketing/HeroDeploy";
import DeployConfiguratorCard from "@/components/marketing/DeployConfiguratorCard";
import TrustStrip from "@/components/marketing/TrustStrip";
import SocialProofCard from "@/components/marketing/SocialProofCard";
import StatsRow from "@/components/marketing/StatsRow";
import {
  FeatureSplitSection,
  ServerVisual,
  ChatVisual,
  CapabilitiesVisual,
} from "@/components/marketing/FeatureSplitSection";
import CapabilitiesGrid from "@/components/marketing/CapabilitiesGrid";
import CustomAgentCTA from "@/components/marketing/CustomAgentCTA";
import Footer from "@/components/marketing/Footer";

const TESTIMONIALS = [
  {
    quote:
      "IQBANDIT cut our agent deployment time from days to minutes. The channel integrations just work.",
    name: "Alex Rivera",
    role: "Head of AI, Acme Corp",
    initials: "AR",
  },
  {
    quote:
      "The Claude Opus integration is seamless. Our support bot handles 80% of tickets automatically.",
    name: "Priya Nair",
    role: "CTO, Velocity AI",
    initials: "PN",
  },
  {
    quote:
      "Best deployment experience I've had. Clean UI, zero configuration headaches.",
    name: "James Chen",
    role: "Founder, NovaTech",
    initials: "JC",
  },
];

export default function DeployPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Fixed navigation ── */}
      <MarketingNav />

      {/* ── Hero + Configurator (two-column on desktop) ── */}
      <div className="pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row items-start gap-12 xl:gap-20 py-20">
            {/* Left: hero copy */}
            <div className="flex-1 pt-4">
              <HeroDeploy />
            </div>

            {/* Right: deploy configurator card */}
            <div className="w-full lg:w-[420px] lg:flex-shrink-0 lg:pt-16">
              <DeployConfiguratorCard />
            </div>
          </div>
        </div>
      </div>

      {/* ── Divider + Trust logos ── */}
      <TrustStrip />

      {/* ── Key stats ── */}
      <StatsRow />

      {/* ── Feature split sections ── */}
      <div id="features" className="divide-y divide-gray-50">
        <FeatureSplitSection
          eyebrow="Infrastructure"
          heading="Your own dedicated cloud server"
          body="Every agent gets its own isolated, always-on server. No shared infrastructure, no cold starts, no surprises. Your agent is ready the moment your users are."
          visual={<ServerVisual />}
        />

        <FeatureSplitSection
          eyebrow="Conversation"
          heading="Chat with your agent, naturally"
          body="Your agent understands context, memory, and nuance — deployed directly inside Telegram, Discord, and WhatsApp. Where your users already are. No new apps to install."
          visual={<ChatVisual />}
          reversed
        />

        <FeatureSplitSection
          eyebrow="Tools & Integrations"
          heading="Powerful capabilities out of the box"
          body="Equip your agent with web search, data analysis, email, calendar access, and more. Toggle tools on or off from your dashboard — no code changes, no redeploy."
          visual={<CapabilitiesVisual />}
        />
      </div>

      {/* ── 8-tile capabilities grid ── */}
      <CapabilitiesGrid />

      {/* ── Social proof / testimonials ── */}
      <section className="max-w-5xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
            Testimonials
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mt-3 tracking-tight">
            Loved by builders
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {TESTIMONIALS.map((t) => (
            <SocialProofCard key={t.name} {...t} />
          ))}
        </div>
      </section>

      {/* ── Dark CTA banner ── */}
      <CustomAgentCTA />

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
}
