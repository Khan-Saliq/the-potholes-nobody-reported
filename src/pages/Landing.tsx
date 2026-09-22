import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Bot,
  Map,
  Shield,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Layout } from '../components/layout/Layout'
import { AnimatedPage } from '../components/ui/AnimatedPage'

const features = [
  {
    icon: TrendingUp,
    title: 'Dynamic Priority Scoring',
    desc: 'Issues ranked by severity, reports, time delay, cluster density, and trust score.',
    color: 'from-cyan-500/20 to-cyan-500/5 text-cyan-400',
  },
  {
    icon: Map,
    title: 'Smart Heatmaps',
    desc: 'Visualize high-risk zones and clustered problem areas on interactive maps.',
    color: 'from-violet-500/20 to-violet-500/5 text-violet-400',
  },
  {
    icon: Shield,
    title: 'Trust Score System',
    desc: 'Verified reports boost reliability; false reports are automatically deprioritized.',
    color: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400',
  },
  {
    icon: Bot,
    title: 'AI Validation',
    desc: 'Morph detection classifies evidence as valid, suspicious, or manipulated.',
    color: 'from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-400',
  },
  {
    icon: Users,
    title: 'Duplicate Handling',
    desc: 'Similar complaints are clustered with a voting mechanism to reduce noise.',
    color: 'from-amber-500/20 to-amber-500/5 text-amber-400',
  },
  {
    icon: Zap,
    title: 'Real-Time Tracking',
    desc: 'Track issues from Reported → In Progress → Resolved with full transparency.',
    color: 'from-blue-500/20 to-blue-500/5 text-blue-400',
  },
]

export function Landing() {
  return (
    <Layout>
      <AnimatedPage>
        <section className="relative overflow-hidden rounded-3xl border border-white/10 px-6 py-16 sm:px-12 sm:py-20">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-600/20 via-violet-600/15 to-fuchsia-600/10 animate-gradient" />
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 animate-float rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 right-10 h-40 w-40 animate-float rounded-full bg-violet-500/10 blur-2xl" style={{ animationDelay: '3s' }} />

          <div className="relative z-10 max-w-2xl">
            <p className="mb-3 animate-fade-in text-sm font-medium uppercase tracking-wider text-cyan-400">
              Dynamic Civic Issue Prioritization System
            </p>
            <h1 className="animate-fade-in-up text-4xl font-bold leading-tight text-slate-50 sm:text-5xl">
              Smarter civic reporting for{' '}
              <span className="text-gradient">faster resolution</span>
            </h1>
            <p className="animate-fade-in-up stagger-2 mt-4 text-lg text-slate-400">
              CivicPulse collects complaints, detects duplicates, prioritizes issues intelligently,
              and validates evidence with AI — so authorities act on what matters most.
            </p>
            <div className="animate-fade-in-up stagger-3 mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary px-5 py-3">
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/map" className="btn-ghost px-5 py-3 text-cyan-300 border-cyan-500/30">
                <Map className="h-4 w-4 text-cyan-400" />
                View Pothole Map
              </Link>
              <Link to="/login" className="btn-ghost px-5 py-3">
                Sign In
              </Link>
            </div>
          <p className="animate-fade-in-up stagger-4 mt-6 text-sm text-slate-500">
            Sign in or register to start reporting civic issues in your area.
          </p>
          </div>
        </section>

        <section className="mt-16">
          <h2 className="animate-fade-in-up text-center text-2xl font-bold text-slate-100">
            Key <span className="text-gradient">Features</span>
          </h2>
          <p className="animate-fade-in-up stagger-1 mx-auto mt-2 max-w-xl text-center text-slate-400">
            Built for citizens and administrators with intelligent prioritization at its core.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <div
                key={f.title}
                className={`glass-card p-6 animate-fade-in-up stagger-${i + 1}`}
              >
                <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br p-3 ${f.color}`}>
                  <f.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-slate-100">{f.title}</h3>
                <p className="mt-2 text-sm text-slate-400">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card mt-16 p-8 animate-fade-in-up">
          <h2 className="text-xl font-bold text-slate-100">
            Priority <span className="text-gradient">Formula</span>
          </h2>
          <p className="mt-2 font-mono text-sm text-cyan-300/80">
            P = (W₁ × Severity) + (W₂ × Reports) + (W₃ × Time Delay) + (W₄ × Cluster Density) + (W₅ × Trust Score)
          </p>
          <p className="mt-2 text-sm text-slate-500">
            AI morph detection adjusts trust scores, automatically deprioritizing unreliable reports.
          </p>
        </section>
      </AnimatedPage>
    </Layout>
  )
}
