import { useRef } from 'react'
import AttachmentChip from '../../../../common/AttachmentChip/AttachmentChip.jsx'
import Icon from '../../../../common/Icon/Icon.jsx'
import SkillMenu from '../SkillMenu/SkillMenu.jsx'
import { useFileDrop } from '../../hooks/useFileDrop/useFileDrop.js'
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENTS } from '../../../../constants.js'
import './ChatComposer.css'

const DROP_HINT = 'Drop your files to attach them'
const ATTACH_HINT = 'Attach a PDF, Word or Excel file, or an image'
const DISCLAIMER = 'Soporti has read-only access to the connected tools. It does not execute code or make changes.'
const TEXTAREA_ROWS = 2

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
  token,
}) {
  const fileInputRef = useRef(null)
  const canAttach = !isLoading && !isUploadingAttachment && hasSourcesSelected && attachments.length < MAX_ATTACHMENTS
  const { isDraggingFiles, dropProps } = useFileDrop(onAttachFiles, canAttach)

  function handleFilesSelected(event) {
    onAttachFiles(event.target.files)
    event.target.value = ''
  }

  function handlePaste(event) {
    const files = [...(event.clipboardData?.files ?? [])]
    if (files.length === 0) return

    event.preventDefault()
    if (canAttach) onAttachFiles(files)
  }

  return (
    <form className={`composer${isDraggingFiles ? ' composer--dropping' : ''}`} onSubmit={onSubmit} {...dropProps}>
      {attachmentError && <p className="alert alert--error composer__error">{attachmentError}</p>}

      <div className="composer__card">
        {menuOpen && <SkillMenu skills={matchingSkills} activeIndex={menuIndex} onSelect={onSelectSkill} />}
        {isDraggingFiles && <p className="composer__drop-hint">{DROP_HINT}</p>}

        {attachments.length > 0 && (
          <ul className="composer__attachments">
            {attachments.map((attachment, index) => (
              <AttachmentChip
                key={`${attachment.name}-${index}`}
                attachment={attachment}
                token={token}
                onRemove={() => onRemoveAttachment(index)}
              />
            ))}
          </ul>
        )}

        <div className="composer__field">
          {commandPrefix && (
            <div className="composer__highlight" ref={highlightRef} aria-hidden="true">
              <span className="composer__command">{commandPrefix}</span>
              {input.slice(commandPrefix.length)}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className={`composer__input${commandPrefix ? ' composer__input--overlaid' : ''}`}
            value={input}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            onScroll={onScroll}
            onPaste={handlePaste}
            placeholder={hasSourcesSelected ? 'Ask Soporti anything...' : 'Select a source from the sidebar first...'}
            rows={TEXTAREA_ROWS}
            disabled={isLoading || !hasSourcesSelected}
          />
        </div>

        <div className="composer__toolbar">
          <input
            ref={fileInputRef}
            type="file"
            className="composer__file-input"
            accept={ATTACHMENT_ACCEPT}
            multiple
            aria-label="Attach files"
            onChange={handleFilesSelected}
          />
          <button
            type="button"
            className="composer__btn composer__btn--attach"
            onClick={() => fileInputRef.current?.click()}
            disabled={!canAttach}
            title={ATTACH_HINT}
            aria-label={ATTACH_HINT}
          >
            <Icon name="paperclip" size={17} strokeWidth={1.7} />
          </button>

          {isLoading ? (
            <button
              type="button"
              className="composer__btn composer__btn--stop"
              onClick={onStop}
              title="Stop"
              aria-label="Stop"
            >
              <Icon name="square" size={14} strokeWidth={0} />
            </button>
          ) : (
            <button
              type="submit"
              className="composer__btn composer__btn--send"
              disabled={!canSend}
              title="Send"
              aria-label="Send"
            >
              <Icon name="arrow-up" size={17} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      <p className="composer__disclaimer">{DISCLAIMER}</p>
    </form>
  )
}
