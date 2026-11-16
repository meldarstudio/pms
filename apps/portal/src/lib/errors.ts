const messages: Record<string, string> = {
  "complaint security check failed": "Complete la verificación de seguridad e inténtelo de nuevo.",
  "complaint security check is unavailable":
    "La verificación de seguridad no está disponible. Inténtelo de nuevo.",

  "invalid complaint attachment": "El identificador del archivo no es válido.",
  "complaint response not found": "No se encontró el registro de respuesta.",
  "complaint attachment storage is unavailable":
    "El almacenamiento de archivos no está disponible. Intenta de nuevo.",
  "complaint attachment exceeds 5 MB": "El archivo supera el límite de 5 MB.",
  "invalid complaint attachment name":
    "El nombre del archivo no es válido. Usa un nombre de hasta 200 caracteres sin barras.",
  "unsupported complaint attachment type":
    "Solo se admiten archivos PDF, JPG y PNG cuyo contenido coincida con el tipo y la extensión.",
  "complaint attachment is empty": "El archivo está vacío.",
  "complaint attachment retry differs":
    "El reintento contiene un archivo diferente. Selecciona el archivo original o adjunta uno nuevo.",
  "complaint attachment not found": "No se encontró el archivo adjunto.",
  "invalid complaint receipt credential": "No se pudo verificar la constancia.",
  "complaint not found": "No se encontró la hoja.",
  "complaint retry differs from saved sheet":
    "El reintento difiere de la hoja guardada. Recupere la constancia.",
  "complaint privacy information changed":
    "La información de privacidad cambió. Revísela antes de continuar.",
  "invalid complaint fields": "Revise los campos de la reclamación.",
  "minor representative is required": "Ingrese los datos del padre o representante.",
  "response email is required": "Ingrese un correo para la respuesta.",
  "too many complaints; retry in one minute": "Espere un minuto y reintente el mismo envío.",
  "invalid complaint response": "Revise la respuesta enviada.",
  "complaint response retry differs": "El reintento difiere de la respuesta guardada.",
  "invalid complaint response sending date":
    "La fecha de envío debe estar entre la fecha de presentación y hoy.",
  "void reason is required": "Escriba el motivo de la anulación.",
  "complaint response already voided": "La respuesta ya fue anulada con otro motivo.",
  "complaint response is voided": "La respuesta está anulada; no se le puede adjuntar evidencia.",
  "invalid complaint backup time": "Revise las fechas de presentación y restauración.",
  "physical complaint reference already imported": "Esta hoja física ya fue transcrita.",
  "complaint receipt does not need attention":
    "Solo se puede enviar otra copia cuando la constancia requiere atención.",
  "complaint receipt copy request differs":
    "El reintento difiere de la solicitud de copia guardada. Recargue la hoja.",
  "Invalid input: expected a valid check-in date": "La fecha de llegada no es válida.",
  "Invalid input: expected a valid checkout date": "La fecha de salida no es válida.",
  "PROPERTY_TIME_ZONE must be a supported IANA timezone":
    "La zona horaria de la propiedad no está configurada correctamente. Configura PROPERTY_TIME_ZONE en el servidor con una zona IANA válida.",
  "property date context required":
    "El servidor necesita el contexto de fecha de la propiedad. Actualiza el backend antes de cambiar el tipo de habitación.",
  "invalid credentials": "Usuario o contraseña incorrectos.",
  "too many login attempts": "Demasiados intentos. Espera un minuto e inténtalo de nuevo.",
  "too many searches": "Demasiadas búsquedas. Espera un minuto e inténtalo de nuevo.",
  "too many quotes": "Demasiadas cotizaciones. Espera un minuto e inténtalo de nuevo.",
  "invalid checkout token": "No se pudo verificar la reserva en curso. Vuelve a empezar.",
  "invalid reservation access": "No se pudo abrir el resumen de la reserva.",
  "reservation access was not established": "Esta reserva no tiene un enlace de resumen.",
  "agreement must be accepted": "Debes aceptar las condiciones de la reserva.",
  "too many acceptances for this checkout":
    "Esta reserva en curso se modificó demasiadas veces. Vuelve a empezar.",
  "quote was replaced by a newer quote":
    "Esta cotización fue reemplazada por una más reciente. Revisa el precio actual.",
  "full name is required": "Ingresa el nombre completo.",
  "email is required": "Ingresa el correo electrónico.",
  "phone is required": "Ingresa el teléfono.",
  "unknown language": "Idioma no admitido.",
  "notes are too long": "Las notas no pueden superar los 2000 caracteres.",
  "online payments are paused":
    "Los pagos en línea están en pausa. La reserva en curso se conserva; inténtalo más tarde o contacta al hotel.",
  "too many payment attempts":
    "Demasiados intentos de pago. Espera un minuto e inténtalo de nuevo.",
  "payment security check failed": "No se pudo completar la verificación de seguridad del pago.",
  "payment security check is unavailable":
    "La verificación de seguridad del pago no está disponible. No se hizo ningún cargo; inténtalo más tarde.",
  "payment security check is required": "Completa la verificación de seguridad antes de pagar.",
  "only card payments are accepted": "Solo se aceptan pagos con tarjeta.",
  "quote has not been accepted": "Acepta las condiciones de esta cotización antes de pagar.",
  "checkout already has a payment":
    "Esta reserva en curso ya tiene un pago. Revisa su estado antes de pedir otro precio.",
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
  "invalid reservation status":
    "La reserva no se guardó porque su estado no es válido. Recarga la reserva.",
  "invalid payment attempt status":
    "El intento de pago no se guardó porque su estado no es válido. Recarga los datos.",
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
  "online check-in must be after today": "Las reservas en línea deben llegar desde mañana.",
  "quote not found": "Esta cotización ya no existe. Vuelve a consultar el precio.",
  "room not found": "Esta habitación ya no existe.",
  "duplicate room in housekeeping marks": "Una habitación está repetida en la limpieza.",
  "room closure not found": "Este cierre ya no existe.",
  "reservation not found": "La reserva ya no existe.",
  "guest not found": "El huésped ya no existe.",
  "payment not found": "El pago ya no existe.",
  "reservation has no active cancellation": "La reserva no tiene una cancelación activa.",
  "only a confirmed reservation can be marked no-show":
    "Solo una reserva confirmada puede marcarse como «No se presentó».",
  "restore the no-show reservation before cancelling it":
    "No se puede cancelar una reserva marcada como «No se presentó».",
  "waiver cannot exceed the cancellation charge":
    "El importe a perdonar no puede superar el cargo pendiente.",
  "refund not found": "El reembolso ya no existe.",
  "refund is already resolved": "Este reembolso ya fue completado o marcado como fallido.",
  "refund date cannot be in the future": "La fecha del reembolso no puede ser futura.",
  "refund exceeds the refund due":
    "El reembolso supera el monto por devolver, descontando las solicitudes pendientes.",
  "refund exceeds the payment's remaining amount":
    "El reembolso supera lo que queda de este pago tras sus otros reembolsos.",
  "change leaves requested refunds above the refund due":
    "El cambio deja reembolsos solicitados por encima del monto por devolver. Márcalos como fallidos primero.",
  "payment with refunds cannot be changed": "Este pago tiene reembolsos y no se puede anular.",
  "payment is already voided": "Este pago ya fue anulado.",
  "voided payment cannot be refunded": "Este pago fue anulado y no se puede reembolsar.",
  "reservation with refunds cannot be restored":
    "La reserva tiene reembolsos y no se puede restaurar. Crea una nueva reserva.",
  "a Culqi refund for this payment is pending":
    "Este pago ya tiene un reembolso a la tarjeta solicitado. Confírmalo o márcalo como fallido en Movimientos.",
  "Culqi refund must be at least 100 cents": "El reembolso a la tarjeta debe ser de al menos S/ 1.",
  "payment is not a Culqi payment":
    "Este pago no se hizo en línea y no se puede devolver a la tarjeta.",
  "Culqi payment cannot be changed": "Los pagos en línea no se pueden anular.",
  "Culqi is not configured": "Los pagos en línea no están configurados en el servidor.",
  "an unfulfilled reservation cannot change status":
    "Esta reserva se canceló porque no había disponibilidad al completarse el pago en línea. Su estado no se puede cambiar.",
  "quote has expired": "La cotización venció. Vuelve a consultar el precio.",
  "quote is already paid": "Esta cotización ya está pagada.",
  "a payment for this quote is still being confirmed":
    "Todavía se está confirmando un pago para esta cotización.",
  "payment attempt not found": "No se encontró el intento de pago.",
  "guest acceptance is required": "Registra que el huésped aceptó el cupón en lugar del reembolso.",
  "coupon exceeds the refund due":
    "El cupón supera el monto por devolver, descontando reembolsos solicitados y cupones ya emitidos.",
  "coupon not found": "No existe un cupón con ese código.",
  "coupon has expired": "El cupón venció y ya no se puede usar.",
  "coupon redemption exceeds its balance": "El monto supera el saldo disponible del cupón.",
  "coupon redemption exceeds the balance owed":
    "El monto del cupón supera el saldo pendiente de la reserva.",
  "stay starts after the coupon expires": "La estancia empieza después del vencimiento del cupón.",
  "reservation already uses another coupon":
    "Esta reserva ya usa otro cupón. Solo se permite un cupón por reserva.",
  "coupon cannot be redeemed on the reservation that issued it":
    "El cupón no se puede usar en la reserva que lo emitió.",
  "coupon requires an active reservation": "Solo se puede usar un cupón en una reserva activa.",
  "reservation with coupons cannot be restored":
    "La reserva tiene movimientos de cupón y no se puede restaurar. Crea una nueva reserva.",
  "payment cannot be changed after issuing a coupon":
    "La reserva emitió un cupón; sus pagos ya no se pueden anular.",
  "too many guests for this room type":
    "La habitación no tiene capacidad para todos los huéspedes.",
  "stay cannot be longer than 60 nights": "La estancia no puede superar las 60 noches.",
  "calendar range is too wide": "El rango del calendario es demasiado amplio.",
  "calendar window is incomplete": "La ventana del calendario está incompleta.",
  "stay must be at least one night": "La estancia debe tener al menos una noche.",
  "invalid email": "Ingresa un correo válido.",
  "invalid phone number": "Ingresa un teléfono válido para el país seleccionado.",
  "invalid nationality": "Selecciona una nacionalidad de la lista.",
  "phone number is too short":
    "El número está incompleto. Si es un teléfono fijo, incluye el código de área.",
  "phone number is too long": "El número tiene demasiados dígitos para el país seleccionado.",
  "phone extensions are not supported": "No se admiten extensiones telefónicas.",
  "amount cannot be zero": "El importe debe ser distinto de cero.",
  "unknown rate plan": "Esta tarifa ya no existe. Elige otra tarifa.",
};

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
