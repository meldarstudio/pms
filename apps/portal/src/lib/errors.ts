const messages: Record<string, string> = {
  "payment date is required": "Indica la fecha del pago.",
  "guest room must belong to this reservation":
    "Asigna al huésped a una habitación de esta reserva.",
  "guest belongs to another reservation":
    "Este huésped pertenece a otra reserva. Recarga los datos.",
  "duplicate staying guest": "Un huésped está repetido en la lista.",
  "stale reservation; reload before saving":
    "La reserva cambió en otra sesión. Recárgala antes de guardar.",
  "request ID reused with a different payload":
    "Esta solicitud ya se utilizó con otros datos. Recarga la reserva.",
  "refund exceeds available credit":
    "La devolución supera el saldo a favor disponible.",
  "waiver exceeds outstanding balance":
    "La condonación supera el saldo pendiente.",
  "waiver correction cannot forgive later debt; record a new waiver":
    "Esta corrección no puede condonar cargos nuevos. Registra otra condonación con su motivo.",
  "reason is required": "Escribe un motivo.",
  "method is required": "Selecciona un método de pago o devolución.",
  "financial date cannot be in the future":
    "La fecha del movimiento no puede ser futura.",
  "final checkout requires settlement of the revised shared balance":
    "La última salida requiere saldar la cuenta revisada.",
  "check-in requires a confirmed assigned room":
    "La llegada requiere una habitación confirmada y asignada.",
  "amend booked dates before arrival outside the stay":
    "Guarda las fechas correctas antes de registrar una llegada fuera de la estancia.",
  "departure outside booked stay requires a date amendment":
    "La salida está fuera de las fechas guardadas. Amplía la estancia antes de registrar la salida.",
  "checked-in rooms only allow extensions; use move for assignment changes":
    "Durante la estancia puedes ampliar fechas o usar la acción de cambio de habitación.",
  "use whole-booking cancellation for the final room":
    "Usa Cancelar reserva para cancelar la última habitación.",
  "accidental removal must retain another active room":
    "Debe quedar otra habitación activa al retirar una habitación por error.",
  "cannot undo arrival after a room move":
    "No se puede deshacer una llegada después de un cambio de habitación.",
  "room is a different type":
    "La habitación debe ser del mismo tipo reservado.",
  "reservation is closed":
    "La reserva está cerrada. No se pueden añadir habitaciones.",
  "room cannot be edited in this status":
    "No se puede editar una habitación en este estado.",
  "financial entry is missing or already void":
    "El movimiento ya fue anulado. Recarga la reserva.",
  "replacement must have the same financial kind":
    "El reemplazo debe ser del mismo tipo de movimiento.",
  "no availability": "No hay disponibilidad para esas fechas.",
  "room is already assigned for those dates":
    "Esta habitación acaba de asignarse a otra reserva.",
  "room is closed for those dates":
    "Esta habitación está cerrada para esas fechas.",
  "room has a stay on those dates":
    "Esta habitación tiene una reserva para esas fechas.",
  "room is already closed on those dates":
    "Esta habitación ya está cerrada para esas fechas.",
  "room has an assigned stay":
    "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo.",
  "room number already exists": "Este número de habitación ya está en uso.",
  "room type already exists": "Este tipo de habitación ya existe.",
  "room type not found": "Este tipo de habitación ya no existe.",
  "room not found": "Esta habitación ya no existe.",
  "reservation not found": "La reserva ya no existe.",
  "guest not found": "El huésped ya no existe.",
  "payment not found": "El pago ya no existe.",
  "too many guests for this room type":
    "La habitación no tiene capacidad para todos los huéspedes.",
  "stay cannot be longer than 60 nights":
    "La estancia no puede superar las 60 noches.",
  "stay must be at least one night":
    "La estancia debe tener al menos una noche.",
  "change dates before check-out":
    "Cambia las fechas antes de registrar la salida.",
  "assign a room before check-in":
    "Asigna una habitación a cada reserva antes del check-in.",
  "check in every room before check-out":
    "Registra el check-in de todas las habitaciones antes del check-out.",
  "cannot check out before arrival date":
    "No se puede registrar la salida antes de la fecha de llegada.",
  "no rooms to check in": "No hay habitaciones confirmadas para check-in.",
  "no rooms to check out": "Ninguna habitación tiene check-in.",
  "no rooms to undo check-in": "Ninguna habitación tiene check-in.",
  "no confirmed rooms to cancel":
    "No hay habitaciones confirmadas para cancelar.",
  "only a confirmed room can be cancelled":
    "Solo se puede quitar una habitación confirmada.",
  "only a confirmed room can be unassigned":
    "Solo se puede desasignar una habitación confirmada.",
  "nights already stayed cannot be removed":
    "No se pueden eliminar noches ya utilizadas.",
  "discount cannot exceed room charges":
    "El descuento no puede superar el importe de la habitación.",
  "invalid email": "Ingresa un correo válido.",
  "invalid paidAt": "Ingresa una fecha y hora de pago válidas.",
  "amount cannot be zero": "El importe debe ser distinto de cero.",
  "Different room type": "Tipo de habitación diferente",
  "Occupied during this stay": "Ocupada durante la estancia",
  "Closed during this stay": "Cerrada durante la estancia",
  "This reserved room is no longer awaiting assignment. Select another reservation.":
    "Esta habitación ya no está pendiente de asignación. Selecciona otra reserva.",
  "This reserved room has already been assigned. Select another reservation.":
    "Esta habitación ya fue asignada. Selecciona otra reserva.",
  "This reservation has changed. Select it again to check the updated stay.":
    "Esta reserva cambió. Selecciónala de nuevo para consultar la estancia actualizada.",
}

export function translateError(message: string) {
  if (/^(Invalid input|Invalid option|Too small|Too big)/i.test(message)) {
    return "Revisa los datos ingresados."
  }
  return messages[message] ?? message
}
