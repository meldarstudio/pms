const messages: Record<string, string> = {
  "Invalid input: expected a valid check-in date": "La fecha de llegada no es válida.",
  "Invalid input: expected a valid checkout date": "La fecha de salida no es válida.",
  "PROPERTY_TIME_ZONE must be a supported IANA timezone":
    "La zona horaria de la propiedad no está configurada correctamente. Configura PROPERTY_TIME_ZONE en el servidor con una zona IANA válida.",
  "property date context required":
    "El servidor necesita el contexto de fecha de la propiedad. Actualiza el backend antes de cambiar el tipo de habitación.",
  "invalid credentials": "Usuario o contraseña incorrectos.",
  "too many login attempts": "Demasiados intentos. Espera un minuto e inténtalo de nuevo.",
  unauthorized: "Tu sesión terminó. Inicia sesión de nuevo.",
  "owner account required": "Solo la cuenta del propietario puede hacer esto.",
  "account not found": "No se encontró la cuenta. Recarga la página.",
  "password must be at least 12 characters": "La contraseña debe tener al menos 12 caracteres.",
  "password must be at most 128 characters": "La contraseña debe tener como máximo 128 caracteres.",
  "change your own password with your current password":
    "Cambia tu propia contraseña con tu contraseña actual.",
  "current password is incorrect": "La contraseña actual no es correcta.",
  "current password is required": "Escribe tu contraseña actual.",
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
  "night price cannot be negative": "El precio de una noche no puede ser negativo.",
  "no availability": "No hay disponibilidad para esas fechas.",
  "room is already assigned for those dates":
    "Esta habitación está ocupada para esas fechas. Cambia la habitación o las fechas.",
  "room is closed for those dates": "Esta habitación está cerrada para esas fechas.",
  "room has a stay on those dates": "Esta habitación tiene una reserva para esas fechas.",
  "room is already closed on those dates": "Esta habitación ya está cerrada para esas fechas.",
  "room has an assigned stay":
    "Desasigna la estancia o muévela a otra habitación antes de cambiar el tipo.",
  "room number already exists": "Este número de habitación ya está en uso.",
  "room appears more than once": "Una habitación está repetida en la tabla.",
  "room type already exists": "Este tipo de habitación ya existe.",
  "room type not found": "Este tipo de habitación ya no existe.",
  "room not found": "Esta habitación ya no existe.",
  "duplicate room in housekeeping marks": "Una habitación está repetida en la limpieza.",
  "room closure not found": "Este cierre ya no existe.",
  "reservation not found": "La reserva ya no existe.",
  "guest not found": "El huésped ya no existe.",
  "payment not found": "El pago ya no existe.",
  "reservation has no active cancellation": "La reserva no tiene una cancelación activa.",
  "only a confirmed reservation can be marked no-show":
    "Solo una reserva confirmada puede marcarse como No-show.",
  "restore the no-show reservation before cancelling it":
    "Restaura la reserva No-show antes de cancelarla.",
  "waiver cannot exceed the cancellation charge":
    "La exoneración no puede superar el cargo de cancelación pendiente.",
  "refund not found": "El reembolso ya no existe.",
  "refund is already resolved": "Este reembolso ya fue completado o marcado como fallido.",
  "refund date cannot be in the future": "La fecha del reembolso no puede ser futura.",
  "refund exceeds the refund due":
    "El reembolso supera el monto por devolver, descontando las solicitudes pendientes.",
  "refund exceeds the payment's remaining amount":
    "El reembolso supera lo que queda de este pago tras sus otros reembolsos.",
  "change leaves requested refunds above the refund due":
    "El cambio deja reembolsos solicitados por encima del monto por devolver. Márcalos como fallidos primero.",
  "payment with refunds cannot be changed":
    "Este pago tiene reembolsos y no se puede editar ni eliminar.",
  "reservation with refunds cannot be restored":
    "La reserva tiene reembolsos y no se puede restaurar. Crea una nueva reserva.",
  "too many guests for this room type":
    "La habitación no tiene capacidad para todos los huéspedes.",
  "stay cannot be longer than 60 nights": "La estancia no puede superar las 60 noches.",
  "calendar range is too wide": "El rango del calendario es demasiado amplio.",
  "calendar window is incomplete": "La ventana del calendario está incompleta.",
  "stay must be at least one night": "La estancia debe tener al menos una noche.",
  "invalid email": "Ingresa un correo válido.",
  "invalid phone number": "Ingresa un teléfono válido para el país seleccionado.",
  "phone number is too short":
    "El número está incompleto. Si es un teléfono fijo, incluye el código de área.",
  "phone number is too long": "El número tiene demasiados dígitos para el país seleccionado.",
  "phone extensions are not supported": "No se admiten extensiones telefónicas.",
  "amount cannot be zero": "El importe debe ser distinto de cero.",
};

/** The Spanish message for a known backend error, or null when it has no translation. */
export function knownErrorMessage(message: string): string | null {
  if (messages[message]) return messages[message];
  if (/^(Invalid input|Invalid option|Too small|Too big)/i.test(message)) {
    return "Revisa los datos ingresados.";
  }
  return null;
}

export function translateError(message: string) {
  return knownErrorMessage(message) ?? message;
}
