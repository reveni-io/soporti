const GROUP_ICON_IDS = { repo: 'github' }

export function groupIconId(groupId) {
  return GROUP_ICON_IDS[groupId] ?? groupId
}
