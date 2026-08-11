import { useRef } from 'react'
import AttachmentChip from '../../../../common/AttachmentChip/AttachmentChip.jsx'
import SkillMenu from '../SkillMenu/SkillMenu.jsx'
import { useFileDrop } from '../../hooks/useFileDrop/useFileDrop.js'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS } from '../../../../constants.js'

const DROP_HINT = 'Drop your files to attach them'

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
  attachments,
  attachmentError,
  isUploadingAttachment,
  onAttachFiles,
  onRemoveAttachment,
}) {
  const fileInputRef = useRef(null)
  const canAttach = !isLoading && !isUploadingAttachment && hasSourcesSelected && attachments.length < MAX_ATTACHMENTS
  const { isDraggingFiles, dropProps } = useFileDrop(onAttachFiles, canAttach)

  function handleFilesSelected(event) {
    onAttachFiles(event.target.files)
    event.target.value = ''
  }

  return (
    <form
      className={`chat__input-area${isDraggingFiles ? ' chat__input-area--dropping' : ''}`}
      onSubmit={onSubmit}
      {...dropProps}
    >
      {attachments.length > 0 && (
        <ul className="chat__attachments">
          {attachments.map((attachment, index) => (
            <AttachmentChip
              key={`${attachment.name}-${index}`}
              attachment={attachment}
              onRemove={() => onRemoveAttachment(index)}
            />
          ))}
        </ul>
      )}

      {attachmentError && <p className="alert alert--error chat__attachment-error">{attachmentError}</p>}

      <div className="chat__input-wrapper">
        {menuOpen && <SkillMenu skills={matchingSkills} activeIndex={menuIndex} onSelect={onSelectSkill} />}
        {isDraggingFiles && <p className="chat__drop-hint">{DROP_HINT}</p>}

        <input
          ref={fileInputRef}
          type="file"
          className="chat__file-input"
          accept={ATTACHMENT_ACCEPT}
          multiple
          aria-label="Attach files"
          onChange={handleFilesSelected}
        />
        <button
          type="button"
          className="chat__btn chat__btn--attach"
          onClick={() => fileInputRef.current?.click()}
          disabled={!canAttach}
          title="Attach a PDF, Word or Excel file"
        >
          &#128206;
        </button>

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
