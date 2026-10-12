const messages: Record<string, string> = {
  "reservation requires at least one room":
    "La reserva debe tener al menos una habitación.",
  "check-in requires an assigned room":
    "Asigna todas las habitaciones antes del check-in.",
  "financial entry not found":
    "Este pago o descuento ya no existe. Actualiza la reserva.",
  "financial kind cannot change":
    "Un pago no puede convertirse en descuento, ni un descuento en pago.",
  "payment date is required": "Indica la fecha del pago.",
  "guest room must belong to this reservation":
    "Asigna al huésped a una habitación de esta reserva.",
  "guest belongs to another reservation":
    "Este huésped pertenece a otra reserva. Recarga los datos.",
  "duplicate staying guest": "Un huésped está repetido en la lista.",
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
  "room is a different type":
    "La habitación debe ser del mismo tipo reservado.",
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
