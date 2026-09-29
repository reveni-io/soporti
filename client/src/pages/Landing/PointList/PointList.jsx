export default function PointList({ points }) {
  return (
    <ul className="lp-points">
      {points.map(point => (
        <li key={point}>{point}</li>
      ))}
    </ul>
  )
}
