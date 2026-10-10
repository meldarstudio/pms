type RoomLine = {
  lineId: string | null
  status: string | null
  roomId: string | null
  removed: boolean
}

export function roomLineActions(line: RoomLine, lines: RoomLine[]) {
  const editable =
    !line.removed &&
    (line.status === "confirmed" || (!line.lineId && line.status === null))
  const active = lines.filter(
    (item) =>
      !item.removed &&
      (item.status === "confirmed" ||
        item.status === "checked_in" ||
        (!item.lineId && item.status === null))
  )

  return {
    visible: editable,
    canUnassign: editable && Boolean(line.roomId),
    canRemove:
      editable &&
      active.length > 1 &&
      (!line.lineId ||
        active.some((item) => item.lineId && item.lineId !== line.lineId)),
  }
}
