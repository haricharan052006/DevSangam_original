import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  ChevronDown,
  Cpu,
  GitBranch,
  Mail,
  MonitorPlay,
  Radio,
  Terminal,
  Users,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import Logo from '../components/Logo'
import Reveal from '../components/Reveal'
import { GitHubIcon, LinkedInIcon } from '../components/BrandIcons'

const CONNECT_LINKS = [
  {
    icon: Mail,
    label: 'Email',
    value: 'hariiitjee2006charan@gmail.com',
    href: 'mailto:hariiitjee2006charan@gmail.com',
  },
  {
    icon: LinkedInIcon,
    label: 'LinkedIn',
    value: 'hari-charan-v-a97b9228a',
    href: 'https://www.linkedin.com/in/hari-charan-v-a97b9228a/',
  },
  {
    icon: GitHubIcon,
    label: 'GitHub',
    value: 'haricharan052006',
    href: 'https://github.com/haricharan052006',
  },
]

const FAQ_ITEMS = [
  {
    question: 'How does real-time conflict-free collaboration work?',
    answer:
      "Every keystroke is applied to a Yjs CRDT document and relayed to every connected client over a lightweight WebSocket layer. Edits from any two collaborators merge deterministically — even concurrent edits on the same line — with no central lock, no \"last write wins,\" and no manual conflict resolution.",
  },
  {
    question: 'How are code executions sandboxed and secured?',
    answer:
      "Each run spins up in an ephemeral, network-isolated Docker container capped at 128MB RAM and 0.5 CPU with a read-only root filesystem. Rather than one rigid timer, two independent guards watch the process: a strict cap on silent CPU-bound loops, and a much longer idle timeout that only engages once the program goes fully quiet — so code legitimately waiting on input() is never killed mid-thought.",
  },
  {
    question: 'Which programming languages are supported?',
    answer:
      'Python, JavaScript (Node.js), C, C++, and Java ship today, each with its own starter template and sandbox runtime. The execution service is built around a per-language runner registry, so adding another interpreter or compiler is a small, contained change rather than a rewrite.',
  },
  {
    question: 'Do I need an account to start coding?',
    answer:
      "Yes — every workspace is tied to an account so your files, room history, and role persist between sessions. Sign-up takes under a minute (email + password, or one click with Google), and every room after that is just a shareable code anyone on your team can join instantly.",
  },
  {
    question: 'Can multiple server instances scale horizontally?',
    answer:
      "Not yet. Presence, document state, and execution state currently live in a single Node process's memory, which keeps the architecture simple but caps you at one instance. Horizontal scaling is on the roadmap and would slot in a shared pub/sub layer (Redis or similar) to broadcast Yjs updates and awareness across instances without changing how the client talks to it.",
  },
]

function FeatureCard({ icon: Icon, title, body }) {
  return (
    <div className="rounded-2xl border border-ice/15 bg-carbon p-8 transition hover:border-electric-violet/40">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-electric-violet/40 bg-electric-violet/10 text-electric-violet">
        <Icon size={18} />
      </div>
      <h3 className="mt-6 font-display text-lg font-medium tracking-[-0.01em] text-ice">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[#8e9aa8]">{body}</p>
    </div>
  )
}

function DiagramNode({ icon: Icon, label, detail }) {
  return (
    <div className="relative flex w-full flex-col items-center gap-3 rounded-2xl border border-ice/20 bg-carbon px-5 py-6 text-center sm:w-48">
      <span className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-electric-violet" />
      <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-electric-violet" />
      <Icon size={22} className="text-electric-violet" />
      <div>
        <p className="label-mono text-ice">{label}</p>
        <p className="mt-1 text-xs text-[#8e9aa8]">{detail}</p>
      </div>
    </div>
  )
}

function DiagramArrow({ vertical }) {
  return (
    <div className={`flex items-center justify-center text-steel ${vertical ? 'h-8 sm:hidden' : 'hidden sm:flex sm:w-8'}`}>
      <ArrowRight size={16} className={vertical ? 'rotate-90' : ''} />
    </div>
  )
}

function ConnectCard({ icon: Icon, label, value, href }) {
  const external = href.startsWith('http')
  return (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      className="group flex items-center gap-4 rounded-2xl border border-ice/20 bg-carbon p-6 transition hover:border-signal-orange/50 hover:shadow-[0_0_28px_-10px_rgba(139,92,246,0.6)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-electric-violet/40 bg-electric-violet/10 text-electric-violet transition group-hover:border-signal-orange/50 group-hover:bg-signal-orange/10 group-hover:text-signal-orange">
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="label-mono text-fog">{label}</p>
        <p className="mt-1 truncate text-sm text-ice">{value}</p>
      </div>
    </a>
  )
}

function FaqItem({ question, answer }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-2xl border border-ice/15 bg-carbon px-5 py-4 sm:px-6">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left"
        aria-expanded={open}
      >
        <span className="font-display text-base font-medium tracking-[-0.01em] text-ice sm:text-lg">{question}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-electric-violet transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p className="pt-4 text-sm leading-relaxed text-[#8e9aa8]">{answer}</p>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
  const [scrolled, setScrolled] = useState(false)

  // Drives both the navbar's compression and the Dev/Sangam wordmark stack —
  // 40px threshold matches the Atlantic reference behavior spec.
  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 40)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function handleJoinRoom(e) {
    e.preventDefault()
    const code = roomCode.trim().toUpperCase()
    navigate(isAuthenticated && code ? `/workspace/${code}` : '/login')
  }

  function handleCreateRoom() {
    navigate(isAuthenticated ? '/dashboard' : '/register')
  }

  const year = new Date().getFullYear()

  return (
    <div className="relative z-10 min-h-screen bg-transparent text-ice">
      {/* relative z-10 + bg-transparent, not a solid void/black fill — this
          page is mounted under App.jsx's PublicLayout, which renders the
          shared ParticleBackground canvas as a fixed z-0 sibling behind it.
          The explicit z-10 matters: without it this div and the canvas both
          land in the same z-index:auto stacking bucket, and while DOM order
          still puts this on top, an explicit z-10 makes that non-negotiable
          rather than an implicit ordering accident. Sections below use
          their own (semi-)opaque surfaces; the gaps between them let the
          canvas show through. */}
      <header className="sticky top-0 z-20 border-b border-ice/15 bg-void/80 backdrop-blur-md">
        <div
          className={`mx-auto flex max-w-[1400px] items-center justify-between px-6 transition-[padding] duration-[450ms] ${
            scrolled ? 'py-2.5' : 'py-4'
          }`}
        >
          <Logo scrolled={scrolled} animated />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#features" className="label-mono text-fog transition hover:text-ice">
              Features
            </a>
            <a href="#architecture" className="label-mono text-fog transition hover:text-ice">
              Architecture
            </a>
            <a href="#connect" className="label-mono text-fog transition hover:text-ice">
              Connect
            </a>
            <a href="#faq" className="label-mono text-fog transition hover:text-ice">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/login" className="label-mono text-fog transition hover:text-ice">
              Sign In
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-signal-orange px-4 py-2 label-mono text-signal-orange transition hover:bg-signal-orange/10"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none relative mx-auto max-w-[1400px] px-6 pb-28 pt-24 text-center sm:pt-32">
          <span className="label-mono pointer-events-auto inline-flex items-center gap-2 rounded-full border border-ice/20 px-3 py-1.5 text-fog">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-electric-violet" />
            CRDT-SYNCED · SANDBOXED EXECUTION · ZERO SETUP
          </span>

          <h1 className="mx-auto mt-8 max-w-4xl font-display text-5xl font-medium leading-[1.05] tracking-[-0.03em] text-ice sm:text-7xl">
            CODE. <span className="text-electric-violet">COLLABORATE.</span> CREATE.
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[#8e9aa8]">
            DevSangam is a real-time collaborative code editor — Yjs CRDT sync keeps every cursor and keystroke
            conflict-free across every open tab, and a sandboxed Docker runner executes Python, JavaScript, C, C++,
            and Java the instant you hit run.
          </p>

          <form onSubmit={handleJoinRoom} className="pointer-events-auto mx-auto mt-10 flex max-w-md flex-col gap-3 sm:flex-row">
            <input
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="DS-89X2-2026"
              className="w-full rounded-lg border border-ice/20 bg-carbon px-4 py-3 text-center font-mono text-sm uppercase tracking-widest text-ice placeholder-steel outline-none transition focus:border-electric-violet"
            />
            <button
              type="submit"
              className="flex shrink-0 items-center justify-center gap-2 rounded-lg border border-signal-orange px-5 py-3 label-mono text-signal-orange transition hover:bg-signal-orange/10"
            >
              Join Room <ArrowRight size={14} />
            </button>
          </form>

          <button
            onClick={handleCreateRoom}
            className="pointer-events-auto mt-5 inline-flex items-center gap-1.5 label-mono text-electric-violet transition hover:text-bright-violet"
          >
            or create an instant workspace <ArrowRight size={12} />
          </button>

          <div className="pointer-events-none mx-auto mt-20 flex h-6 w-6 items-center justify-center rounded border border-ice/20">
            <ChevronDown size={14} className="text-fog" />
          </div>
        </div>
      </section>

      <section id="features" className="border-t border-ice/10 bg-carbon/60">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-electric-violet">[ CAPABILITIES ]</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-medium tracking-[-0.03em] text-ice sm:text-6xl">
              Built for teams who ship together
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            <Reveal delay={0}>
              <FeatureCard
                icon={Users}
                title="Real-Time CRDT Sync"
                body="Concurrent multi-cursor editing powered by Yjs over a lightweight WebSocket relay — every keystroke merges conflict-free across every open tab, with live presence avatars and color-coded remote cursor tags."
              />
            </Reveal>
            <Reveal delay={100}>
              <FeatureCard
                icon={Cpu}
                title="Isolated Docker Sandbox"
                body="Python, JavaScript, C, C++, and Java execute inside ephemeral, memory- and CPU-capped containers. Adaptive timeout guards kill runaway loops in seconds without ever punishing a program that's just waiting on input()."
              />
            </Reveal>
            <Reveal delay={200}>
              <FeatureCard
                icon={Radio}
                title="Presence & Telemetry"
                body="Live user badges, per-run exit codes and duration, and a shared terminal console — every collaborator in the room watches the same execution unfold, stdout and stderr streamed line by line."
              />
            </Reveal>
          </div>
        </div>
      </section>

      <section id="architecture" className="border-t border-ice/10">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-electric-violet">[ ARCHITECTURE ]</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-medium tracking-[-0.03em] text-ice sm:text-6xl">
              One socket, four moving parts
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[#8e9aa8]">
              Editing and execution ride two independent, purpose-built channels — a document-sync socket and a
              command/telemetry socket — so a slow build never blocks a keystroke.
            </p>
          </Reveal>

          <Reveal delay={150} className="mt-16 flex flex-col items-center gap-0 sm:flex-row sm:justify-center sm:gap-0">
            <DiagramNode icon={MonitorPlay} label="Monaco Editor" detail="Your keystrokes, locally" />
            <DiagramArrow vertical />
            <DiagramArrow />
            <DiagramNode icon={GitBranch} label="Yjs / WebSocket" detail="CRDT merge + presence" />
            <DiagramArrow vertical />
            <DiagramArrow />
            <DiagramNode icon={Terminal} label="Exec Socket" detail="Run command + stdin" />
            <DiagramArrow vertical />
            <DiagramArrow />
            <DiagramNode icon={Cpu} label="Docker Engine" detail="Sandboxed process" />
          </Reveal>
        </div>
      </section>

      <section id="connect" className="border-t border-ice/10 bg-carbon/60">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-electric-violet">[ CREATOR CONNECT ]</p>
            <h2 className="mt-3 max-w-2xl font-display text-4xl font-medium tracking-[-0.03em] text-ice sm:text-6xl">
              BUILT FOR DEVELOPERS BY HARI CHARAN
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-[#8e9aa8]">
              DevSangam is an independent project — questions, feedback, or just want to talk shop? Reach out
              directly.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {CONNECT_LINKS.map((link, i) => (
              <Reveal key={link.label} delay={i * 100}>
                <ConnectCard {...link} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="border-t border-ice/10">
        <div className="mx-auto max-w-[1400px] px-6 py-24">
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-electric-violet">[ SYSTEM FAQ ]</p>
            <h2 className="mt-3 max-w-xl font-display text-4xl font-medium tracking-[-0.03em] text-ice sm:text-6xl">
              Frequently Asked Questions
            </h2>
          </Reveal>

          <Reveal delay={100} className="mx-auto mt-12 max-w-3xl space-y-3">
            {FAQ_ITEMS.map((item) => (
              <FaqItem key={item.question} {...item} />
            ))}
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-ice/10 bg-carbon py-12">
        <div className="mx-auto flex max-w-[1400px] flex-col items-center gap-4 px-6 text-center">
          <Logo />
          <p className="label-mono text-fog">© {year} DevSangam — Code. Collaborate. Create.</p>
        </div>
      </footer>
    </div>
  )
}
