export default function SkillMenu({ skills, activeIndex, onSelect }) {
  if (skills.length === 0) {
    return (
      <ul className="chat__skill-menu" role="listbox">
        <li className="chat__skill-menu-empty">No matching skills</li>
      </ul>
    )
  }

  return (
    <ul className="chat__skill-menu" role="listbox">
      {skills.map((skill, index) => (
        <li
          key={skill.id}
          role="option"
          aria-selected={index === activeIndex}
          className={`chat__skill-menu-item${index === activeIndex ? ' chat__skill-menu-item--active' : ''}`}
          onMouseDown={event => {
            event.preventDefault()
            onSelect(skill)
          }}
        >
          <span className="chat__skill-menu-name">/{skill.name}</span>
          {skill.description && <span className="chat__skill-menu-description">{skill.description}</span>}
        </li>
      ))}
    </ul>
  )
}
