const messages: Record<string, string> = {
  "reservation requires at least one room": "La reserva debe tener al menos una habitación.",
  "payment date is required": "Indica la fecha del pago.",
  "guest room must belong to this reservation":
    "Asigna al huésped a una habitación de esta reserva.",
  "guest belongs to another reservation":
    "Este huésped pertenece a otra reserva. Recarga los datos.",
  "duplicate staying guest": "Un huésped está repetido en la lista.",
  "request ID reused with a different payload":
    "Esta solicitud ya se utilizó con otros datos. Recarga la reserva.",
  "reservation changed while saving; please try again":
    "La reserva cambió mientras se guardaba. Intenta guardar de nuevo.",
  "method is required": "Selecciona un método de pago.",
  "payment date cannot be in the future": "La fecha del pago no puede ser futura.",
  "room is a different type": "La habitación debe ser del mismo tipo reservado.",
  "no availability": "No hay disponibilidad para esas fechas.",
  "room is already assigned for those dates":
    "Esta habitación está ocupada para esas fechas. Cambia la habitación o las fechas.",
  "room is closed for those dates": "Esta habitación está cerrada para esas fechas.",
  "room has a stay on those dates": "Esta habitación tiene una reserva para esas fechas.",
  "room is already closed on those dates": "Esta habitación ya está cerrada para esas fechas.",
  "room has an assigned stay":
    "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo.",
  "room number already exists": "Este número de habitación ya está en uso.",
  "room type already exists": "Este tipo de habitación ya existe.",
  "room type not found": "Este tipo de habitación ya no existe.",
  "room not found": "Esta habitación ya no existe.",
  "room closure not found": "Este cierre ya no existe.",
  "reservation not found": "La reserva ya no existe.",
  "guest not found": "El huésped ya no existe.",
  "payment not found": "El pago ya no existe.",
  "too many guests for this room type":
    "La habitación no tiene capacidad para todos los huéspedes.",
  "stay cannot be longer than 60 nights": "La estancia no puede superar las 60 noches.",
  "stay must be at least one night": "La estancia debe tener al menos una noche.",
  "invalid email": "Ingresa un correo válido.",
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
};

export function translateError(message: string) {
  if (/^(Invalid input|Invalid option|Too small|Too big)/i.test(message)) {
    return "Revisa los datos ingresados.";
  }
  return messages[message] ?? message;
}
