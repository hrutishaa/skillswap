import { Link } from 'react-router-dom'
import { Avatar, CategoryArt, CreditBadge, Rating } from './ui.jsx'
import { shortName } from '../lib/format.js'

export default function SkillCard({ skill }) {
  return (
    <Link to={`/skills/${skill.id}`} className="card group flex flex-col p-3 transition hover:-translate-y-0.5 hover:border-ember-400" data-testid="skill-card">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Avatar name={skill.teacherName} id={skill.teacherId} size={28} />
          <div className="leading-tight">
            <div className="text-[11px] text-ink-500">Mentor</div>
            <div className="text-xs font-bold">{shortName(skill.teacherName)}</div>
          </div>
        </div>
        <Rating value={skill.rating} count={skill.reviewCount} />
      </div>
      <CategoryArt category={skill.category} />
      <div className="mt-3 flex items-end justify-between gap-2">
        <div>
          <h3 className="font-extrabold leading-snug group-hover:text-ember-600">{skill.title}</h3>
          <p className="text-xs text-ink-500">{skill.level} &middot; {skill.category}</p>
        </div>
        <CreditBadge value={skill.creditsPerHour} />
      </div>
    </Link>
  )
}
