import SkillBadge from '../../SkillBadge/SkillBadge.jsx'

export default function UserMessage({ message, token }) {
  return (
    <div className="message message--user">
      <div className="message__bubble message__bubble--user">
        {message.skills?.map(skill => (
          <span key={skill.id ?? skill.name}>
            <SkillBadge skill={skill} token={token} />{' '}
          </span>
        ))}
        {message.content}
      </div>
    </div>
  )
}
