import './CitationMarker.css'

export default function CitationMarker({ citations, url, onSelect }) {
  const index = citations.findIndex(citation => citation.url === url)

  if (index === -1) return null

  const citation = citations[index]

  function handleClick() {
    onSelect(url)
  }

  return (
    <button
      type="button"
      className="citation-marker"
      onClick={handleClick}
      title={citation.title}
      aria-label={`Source ${index + 1}: ${citation.host}`}
    >
      {index + 1}
    </button>
  )
}
