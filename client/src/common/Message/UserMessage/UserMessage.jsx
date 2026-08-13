import AttachmentChip from '../../AttachmentChip/AttachmentChip.jsx'
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

      {message.attachments?.length > 0 && (
        <ul className="message__attachments">
          {message.attachments.map((attachment, index) => (
            <AttachmentChip key={`${attachment.name}-${index}`} attachment={attachment} token={token} />
          ))}
        </ul>
      )}
    </div>
  )
}
