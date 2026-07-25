import SkillMenu from '../SkillMenu/SkillMenu.jsx'

export default function ChatComposer({
  input,
  textareaRef,
  highlightRef,
  commandPrefix,
  canSend,
  menuOpen,
  matchingSkills,
  menuIndex,
  onChange,
  onKeyDown,
  onSubmit,
  onSelectSkill,
  onBlur,
  onScroll,
  isLoading,
  hasSourcesSelected,
  onStop,
}) {
  return (
    <form className="chat__input-area" onSubmit={onSubmit}>
      <div className="chat__input-wrapper">
        {menuOpen && <SkillMenu skills={matchingSkills} activeIndex={menuIndex} onSelect={onSelectSkill} />}

        <div className="chat__input-field">
          {commandPrefix && (
            <div className="chat__input-highlight" ref={highlightRef} aria-hidden="true">
              <span className="chat__input-command">{commandPrefix}</span>
              {input.slice(commandPrefix.length)}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={`chat__input${commandPrefix ? ' chat__input--overlaid' : ''}`}
            value={input}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            onScroll={onScroll}
            placeholder={hasSourcesSelected ? 'Ask Soporti anything...' : 'Select a source from the sidebar first...'}
            rows={1}
            disabled={isLoading || !hasSourcesSelected}
          />
        </div>

        {isLoading ? (
          <button type="button" className="chat__btn chat__btn--stop" onClick={onStop} title="Stop">
            &#9632;
          </button>
        ) : (
          <button type="submit" className="chat__btn chat__btn--send" disabled={!canSend} title="Send">
            &#8593;
          </button>
        )}
      </div>
      <p className="chat__disclaimer">
        Soporti has read-only access to the connected tools. It does not execute code or make changes.
      </p>
    </form>
  )
}
