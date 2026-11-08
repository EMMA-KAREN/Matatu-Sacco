import { Link } from "react-router-dom";
import useSacco from "../hooks/useSacco";

const features = [
  { icon: "🏦", bg: "bg-emerald-50", title: "Welfare & Savings", desc: "Grow your savings regularly to unlock competitive low-interest loans. Your financial safety net is our priority." },
  { icon: "📋", bg: "bg-blue-50", title: "Safe Fleet Standards", desc: "We enforce national transport regulations. Keep your driver and conductor certifications up to date." },
  { icon: "🤝", bg: "bg-purple-50", title: "Community Support", desc: "Contact our office for help with routing, fleet assignments, or emergency services." },
];

const conduct = [
  { title: "Passenger Safety First", desc: "Drive responsibly. Observe speed limits and traffic laws at all times." },
  { title: "Professional Customer Care", desc: "Treat passengers with courtesy and maintain professional hygiene standards." },
  { title: "Compliance Check", desc: "Ensure valid inspection stickers, licenses, and Sacco-registered routes before operating." },
  { title: "Welfare Contributions", desc: "Consistent contributions strengthen our community and increase your borrowing capacity." },
];

// showActions: show Login/Signup or "Go to Dashboard" buttons (used on the public home page)
export default function SaccoHome({ user, showActions = false }) {
  const sacco = useSacco();

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6 lg:space-y-8 text-slate-800">
      {/* Hero */}
      <section className="bg-gradient-to-r from-emerald-600 to-teal-700 rounded-2xl p-6 sm:p-8 lg:p-10 text-white shadow-xl relative overflow-hidden">
        <span className="absolute -right-4 -top-6 text-[140px] sm:text-[200px] font-black opacity-10 select-none pointer-events-none leading-none">
          🚐
        </span>
        <div className="relative z-10 max-w-xl">
          <span className="bg-emerald-500/30 text-emerald-100 text-xs px-3 py-1 rounded-full font-bold uppercase tracking-wider">
            Sacco Portal Home
          </span>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black mt-3">
            {user ? `Welcome back, ${user.name?.split(" ")[0] || ""}` : `Welcome to ${sacco.sacco_name}`}
          </h1>
          <p className="text-emerald-100 text-sm sm:text-base mt-2 leading-relaxed">
            Empowering matatu owners, drivers, conductors, and crew through financial growth, safe operations, and community solidarity.
          </p>

          {showActions && (
            <div className="flex flex-wrap gap-3 mt-6">
              {user ? (
                <Link to="/dashboard" className="bg-white text-emerald-700 font-bold text-sm px-5 py-2.5 rounded-lg shadow hover:bg-emerald-50 transition">
                  Go to Dashboard →
                </Link>
              ) : (
                <>
                  <Link to="/login" className="bg-white text-emerald-700 font-bold text-sm px-5 py-2.5 rounded-lg shadow hover:bg-emerald-50 transition">
                    🔑 Login
                  </Link>
                  <Link to="/signup" className="bg-emerald-800/40 border border-white/30 text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:bg-emerald-800/60 transition">
                    📝 Create Account
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Feature cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {features.map((f) => (
          <div key={f.title} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:shadow-md transition-shadow">
            <div className={`w-12 h-12 ${f.bg} rounded-xl flex items-center justify-center text-2xl`}>{f.icon}</div>
            <h3 className="font-bold text-lg">{f.title}</h3>
            <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </section>

      {/* Conduct + Contact */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-xl font-black">📜 Sacco Code of Conduct</h2>
          <div className="space-y-3">
            {conduct.map((item, idx) => (
              <div key={idx} className="flex gap-4 items-start border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <div>
                  <h4 className="font-bold text-sm">{item.title}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <span className="bg-slate-800 text-slate-300 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest">
              Official Directory
            </span>
            <h3 className="text-lg font-black">{sacco.sacco_name} Headquarters</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              For documentation, license submissions, disputes, or welfare registrations, contact our headquarters.
            </p>
          </div>

          <div className="space-y-4 text-xs border-t border-slate-800 pt-4 mt-6">
            {[
              ["📍", "Office Location", sacco.location || "Central Terminal Office", "text-slate-200"],
              ["📬", "Postal Address", sacco.po_box || "P.O. Box 80100", "text-slate-200"],
              ["📞", "Help Desk & Hotline", sacco.phone_number || "+254 712 345 678", "text-emerald-400"],
            ].map(([icon, label, value, color]) => (
              <div key={label} className="flex items-center gap-3">
                <span className="text-lg">{icon}</span>
                <div className="min-w-0">
                  <p className="text-slate-400 text-[10px] uppercase font-bold">{label}</p>
                  <p className={`font-semibold break-words ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}