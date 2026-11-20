function countLabel(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function describeQueries(count) {
  return countLabel(count, 'scheduled query', 'scheduled queries')
}

export function describeRuns(count) {
  return countLabel(count, 'run', 'runs')
}

export function describeReplies(count) {
  return countLabel(count, 'reply', 'replies')
}
