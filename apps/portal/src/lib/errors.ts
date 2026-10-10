const messages: Record<string, string> = {
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
