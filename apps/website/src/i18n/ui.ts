import { i18n } from "astro:config/client";

export const defaultLang = i18n?.defaultLocale === "en" ? "en" : "es";

export const ui = {
  en: {
    "complaints.securityCheck": "Security check",
    "complaints.securityFailed":
      "Complete the security check and try again. Your draft is retained.",
    "complaints.securityUnavailable":
      "The security check is unavailable. Your draft is retained; try again.",
    "complaints.retrySecurityCheck": "Retry security check",

    "complaints.optionalEmailLabel": "Email (optional)",
    "complaints.referenceHint": "If you do not have a reservation, enter “Not applicable”.",
    "complaints.amountLabel": "Amount (optional)",
    "complaints.amountHint": "Leave blank if unknown or not applicable.",
    "complaints.consumerDetails": "1. Consumer details",
    "complaints.complaintDetails": "2. Complaint details",
    "complaints.writtenResponse": "3. Written response",
    "complaints.optionalEmail": "Optional when you choose a response by letter.",

    "complaints.field.fullName": "Full name",
    "complaints.field.address": "Address",
    "complaints.field.documentType": "Document type",
    "complaints.field.documentNumber": "Document number",
    "complaints.field.phone": "Phone",
    "complaints.field.email": "Email",
    "complaints.field.representative":
      "Parent or representative: name, document, address and contact",
    "complaints.field.product": "Product or service",
    "complaints.field.amount": "Amount (optional; leave blank if unknown or not applicable)",
    "complaints.field.category": "Category",
    "complaints.field.description": "Description",
    "complaints.field.requestedRemedy": "Requested remedy",
    "complaints.field.reservationReference": "Reservation reference",
    "complaints.field.responseChannel": "Written response channel",
    "complaints.field.minor": "Consumer is a minor",
    "complaints.error.complaint_privacy_information_changed":
      "Privacy information changed. Reload the page to review it; your draft is retained.",
    "complaints.error.complaint_retry_differs_from_saved_sheet":
      "This submission already has a saved sheet. Recover its receipt before filing another.",
    "complaints.error.invalid_complaint_receipt_credential":
      "No receipt was found for this submission.",
    "complaints.error.invalid_complaint_fields": "Review the indicated fields.",
    "complaints.error.minor_representative_is_required":
      "Enter the parent or representative details.",
    "complaints.error.response_email_is_required":
      "Enter an email address for the written response.",
    "complaints.error.too_many_complaints_retry_in_one_minute":
      "Wait one minute and retry the same submission. Your draft is retained.",
    "complaints.sheet.title": "Hoja de Reclamación (complaint sheet)",
    "complaints.sheet.number": "No.",
    "complaints.sheet.date": "Date",
    "complaints.sheet.identificationCode": "Identification code",
    "complaints.sheet.consumer": "1. Consumer identification",
    "complaints.sheet.goods": "2. Product or service contracted",
    "complaints.sheet.detail": "3. Complaint details and consumer's request",
    "complaints.sheet.provider": "4. Provider's observations and actions taken",
    "complaints.sheet.responseDate": "Date the response was communicated",
    "complaints.sheet.yes": "Yes",
    "complaints.sheet.no": "No",
    "complaints.sheet.reclamoDefinition":
      "Reclamo: dissatisfaction related to the products or services.",
    "complaints.sheet.quejaDefinition":
      "Queja: dissatisfaction not related to the products or services, or discontent with customer service.",
    "complaints.sheet.otherRemedies":
      "Filing a reclamo does not prevent using other dispute resolution channels, and it is not a prerequisite for filing a complaint with INDECOPI.",
    "complaints.sheet.deadline":
      "The provider must respond to the reclamo or queja within fifteen (15) business days, which cannot be extended.",
    "complaints.sheet.recipient": "Recipient: consumer",
    "complaints.registered": "Registered",
    "complaints.filed": "Filed",
    "complaints.responseDeadline": "Response deadline",
    "complaints.unknownNotApplicable": "Unknown / not applicable",
    "complaints.privacyPolicyVersion": "Privacy policy version",
    "complaints.emailSubmittedDeliveryIsNotConfirmed":
      "Email submitted; delivery is not confirmed.",
    "complaints.emailQueuedDeliveryIsNotConfirmed": "Email queued; delivery is not confirmed.",
    "complaints.emailFailedYourSheetRemainsRegisteredDo":
      "Email failed. Your sheet remains registered. Do not file again.",
    "complaints.noAutomaticEmailRequested": "No automatic email requested.",
    "complaints.printSheet": "Print sheet",
    "complaints.couldNotRegisterTheSheetYourDraft":
      "Could not register the sheet. Your draft is retained; retry the same submission.",
    "complaints.yourDraftIsRetainedRetryTheSame":
      "Your draft is retained. Retry the same submission to recover its receipt.",
    "complaints.networkErrorYourDraftIsRetainedRetry":
      "Network error. Your draft is retained; retry the same submission.",
    "complaints.startAnotherSheetSaveOrPrintThis":
      "Start another sheet (save or print this one first)",
    "complaints.recoveringReceipt": "Recovering your saved sheet…",
    "complaints.fullPrivacyInformation": "Full privacy information",
    "complaints.privacyPage": "Privacy information for all our services",
    "complaints.consumerAndComplaintDetails": "Consumer and complaint details",
    "complaints.email": "Email",
    "complaints.letterToTheAddressProvided": "Letter to the address provided",
    "complaints.registering": "Registering…",
    "complaints.retrySameSubmission": "Retry same submission",
    "complaints.registerSheet": "Register sheet",

    "nav.home": "Home",
    "nav.rooms": "Rooms & rates",
    "nav.churin": "Churín",
    "nav.book": "Book now",
    "nav.primary": "Primary navigation",
    "nav.mobile": "Mobile navigation",
    "menu.open": "Open menu",
    "menu.close": "Close menu",
    "languageSelect.accessibleLabel": "Select language",
    "brand.name": "Hotel Manantial",
    "brand.subtitle": "Churín, Peru",
    skipToContent: "Skip to main content",
    "meta.title": "Hotel Manantial — Hotel in Churín, Peru",
    "meta.description":
      "Stay at Hotel Manantial in Churín, Peru, 5 minutes by car from the thermal baths of Mamahuarmi and La Juventud.",
    "meta.home.title": "Hotel in Churín with Parking, near the Hot Springs | Hotel Manantial",
    "meta.home.description":
      "Hotel in Churín, 5 min by car from the Mamahuarmi and La Juventud hot springs. Free parking, private bath, 24-h front desk. Check prices and book direct.",
    "meta.rooms.title": "Rooms & Rates in Churín | Hotel Manantial",
    "meta.rooms.description":
      'King room, premium double and family suite in Churín, priced per room with taxes included. 55" Smart TV, 24-h front desk, free parking. Check prices for your dates.',
    "meta.churin.title": "Churín Hot Springs Guide & How to Get There | Hotel Manantial",
    "meta.churin.description":
      "Guide to Mamahuarmi, La Juventud and Tingo, and how to reach Churín from Lima (≈ 4 h). Hotel Manantial: walk to the springs, 3 min to the plaza.",
    "meta.ogImageAlt": "Hotel Manantial, Churín, Peru. King room on a higher floor with a balcony.",
    "hero.title": "Hotel in Churín, 5 minutes by car from the hot springs",
    "hero.benefits": "Hotel amenities",
    "hero.parking": "Free parking",
    "hero.bathroom": "Private bathroom",
    "hero.reception": "24-hour front desk",
    "hero.bookCta": "Check availability",
    "hero.roomsCta": "See rooms and rates",
    "hero.imageAlt": "Room at Hotel Manantial in Churín",
    "landing.arrivalPlaceholder": "Choose arrival",
    "landing.departurePlaceholder": "Choose departure",
    "landing.chooseArrival": "Choose your arrival date",
    "landing.chooseDeparture": "Choose your departure date",
    "landing.stayHint": "Choose your arrival and departure dates.",
    "landing.closeCalendar": "Close calendar",
    "landing.closeGuests": "Close guests",
    "landing.guests": "Guests",
    "landing.decreaseAdults": "Decrease adults",
    "landing.increaseAdults": "Increase adults",
    "landing.decreaseChildren": "Decrease children",
    "landing.increaseChildren": "Increase children",
    "rooms.title": "King room",
    "rooms.body":
      "One king bed, a private bathroom and Wi-Fi. Also available: Premium double and Family suite. Rates are per room, not per person.",
    "rooms.cta": "See all room types",
    "rooms.imageAlt": "King room at Hotel Manantial",
    "rooms.pageTitle": "Rooms & rates in Churín",
    "rooms.king.name": "King room",
    "rooms.king.lead":
      "For two, or parents with a small child. Our lowest-priced room, with the same king bed as the Family suite.",
    "rooms.king.beds": "1 king bed",
    "rooms.photo.king": "King room with a smart TV and balcony at Hotel Manantial, Churín",
    "rooms.double.name": "Premium double",
    "rooms.double.lead":
      "For friends or travel companions who'd rather not share a bed: each gets their own full-size bed.",
    "rooms.double.beds": "2 full-size beds",
    "rooms.king.area": "194 sq ft",
    "rooms.double.area": "215 sq ft",
    "rooms.family.area": "237 sq ft",
    "rooms.photo.kingFrontView":
      "Front view of the king room with a smart TV and balcony at Hotel Manantial, Churín",
    "rooms.photo.doubleSide":
      "Two beds, a window, and a TV in the premium double room at Hotel Manantial, Churín",
    "rooms.photo.doubleTop":
      "Two beds and a seating area in the premium double room at Hotel Manantial, Churín",
    "rooms.photo.doubleClose":
      "Close view of the two beds in the premium double room at Hotel Manantial, Churín",
    "rooms.family.name": "Family suite",
    "rooms.family.lead":
      "For parents traveling with an older child, who gets a bed of their own. The largest room in the hotel.",
    "rooms.family.beds": "1 king bed and 1 twin",
    "rooms.photo.familyFront":
      "King bed and single bed in the family suite at Hotel Manantial, Churín",
    "rooms.photo.familySide":
      "Side view of the king bed and single bed in the family suite at Hotel Manantial, Churín",
    "rooms.photo.familyClose":
      "Close view of the two beds in the family suite at Hotel Manantial, Churín",
    "rooms.photo.kingBalcony":
      "King bed beside the balcony in the king room at Hotel Manantial, Churín",
    "rooms.gallery.label": "{room} photos",
    "rooms.gallery.open": "Open photo",
    "rooms.gallery.show": "Show photo {position}",
    "rooms.gallery.of": "of",
    "rooms.gallery.previous": "Previous photo",
    "rooms.gallery.next": "Next photo",
    "rooms.gallery.close": "Close",
    "rooms.included.title": "In every room",
    "rooms.included.bathroom": "Private bathroom with hot water",
    "rooms.included.towels": "Towels and toiletries",
    "rooms.included.tv": '55" 4K Smart TV',
    "rooms.included.wifi": "Wi-Fi",
    "rooms.included.views": "Varied views",
    "rooms.hotel.title": "At the hotel",
    "rooms.hotel.reception": "24-hour reception",
    "rooms.hotel.elevator": "Elevator",
    "rooms.hotel.parking": "Free private parking",
    "rooms.card.sleeps": "Sleeps {count}",
    "rooms.card.wifi": "Free Wi-Fi",
    "rooms.details.open": "Room details",
    "rooms.details.close": "Close room details",
    "rooms.policies.checkInTitle": "Check-in and check-out",
    "rooms.policies.checkIn": "Check-in",
    "rooms.policies.checkInValue": "From 2:00 p.m.",
    "rooms.policies.checkOut": "Check-out",
    "rooms.policies.checkOutValue": "Until 11:00 a.m.",
    "rooms.policies.breakfast": "Breakfast",
    "rooms.policies.breakfastValue": "The hotel does not provide breakfast service.",
    "rooms.policies.cancelTitle": "Cancellation",
    "rooms.policies.cancelFlexibleBody":
      "Flexible rate: you may cancel free of charge up to and including two calendar days before your arrival date, Peru time. If you cancel after this deadline or do not arrive, the first night's accommodation will be charged.",
    "rooms.policies.cancelNonRefundableBody":
      "Non-refundable rate: full payment for the stay is required when booking. If you cancel or do not arrive, the full stay is charged and the amount paid is not returned, unless the hotel cannot provide the service or there is an overpayment.",
    "rooms.policies.petsTitle": "Pets",
    "rooms.policies.petsBody":
      "Pets are permitted. If you are travelling with a pet, please inform us when making your reservation.",
    "rooms.policies.conditionsLink": "Full reservation conditions, changes and refunds",
    "rooms.policies.paymentTitle": "Paying at the hotel",
    "rooms.policies.paymentBody":
      "Any outstanding balance for your stay is due at check-in. We accept cash, cards, Yape and bank transfers. Payment at the hotel does not replace the initial payment required to confirm your reservation.",
    "churin.title": "The springs and town center, on foot",
    "churin.body":
      "The municipal market is next door and the Plaza de Armas is a 3-minute walk. La Juventud and Mamahuarmi are about 11 and 13 minutes away on foot.",
    "churin.cta": "Churín hot springs guide",
    "churin.imageAlt": "Plaza de Armas in Churín",
    "churin.pageTitle": "Churín Hot Springs: a practical guide",
    "churin.deck":
      "Churín, capital of Pachangara district (Oyón, Lima), sits beside the Huaura River.",
    "churin.intro":
      "People come for the thermal waters, and from Hotel Manantial you can walk to Mamahuarmi and La Juventud. The Plaza de Armas is a 3-minute walk.",
    "churin.bookCta": "Check availability",
    "churin.centerTitle": "Central Churín",
    "churin.roadTitle": "Getting here from Lima",
    "churin.roadCarLabel": "By car, how most guests come:",
    "churin.roadCar":
      "Panamericana Norte to Huacho, then the road via Sayán to Churín. Park free in our private garage when you arrive.",
    "churin.roadBusLabel": "By bus:",
    "churin.roadBus": "several companies run buses to Churín from Plaza Norte in Lima.",
    "churin.roomsCta": "See rooms and rates",
    "churin.fact.altitude": "Altitude",
    "churin.fact.altitudeValue": "7,408 ft",
    "churin.fact.fromLima": "From Lima",
    "churin.fact.fromLimaValue": "129 mi",
    "churin.fact.driveTime": "By car",
    "churin.fact.driveTimeValue": "≈ 4 h",
    "churin.fact.baths": "Water",
    "churin.fact.temp": "30–55 °C (86–131 °F)",
    "churin.center":
      "The municipal market is right next door to the hotel, and the Plaza de Armas and the rest of the town center are easy to explore on foot. Try the trout, which you'll find on almost every menu in town. Nights are cool at this altitude, so bring a light jacket for the walk back.",
    "churin.bathsTitle": "The hot springs",
    "churin.bathsLead":
      "Each complex has pools at different temperatures, so you can choose how hot you like it.",
    "churin.mamahuarmi.imageAlt": "Outdoor pools at Mamahuarmi",
    "churin.mamahuarmi.drive": "About 13 min on foot or 5 min by car",
    "churin.mamahuarmi.body":
      "Open-air turquoise pools among eucalyptus and molle trees. Favorites are the Poza de los Novios and the Velo de la Novia, a small waterfall you can stand under. For quiet, head to La Mellicera, the most secluded pool.",
    "churin.juventud.imageAlt": "Round pool at La Juventud",
    "churin.juventud.drive": "About 11 min on foot or 5 min by car",
    "churin.juventud.body":
      "On the left as you enter town. Choose the large shared pools or a family pool, and don't miss the strong water jet that works like a massage. The Poza de la Amistad and Poza Uchuj are outdoors.",
    "churin.tingo.imageAlt": "Pools at the Tingo hot springs",
    "churin.tingo.drive": "10 min by car or local transport",
    "churin.tingo.body":
      "Past the Tingo bridge on the right bank of the Huaura. The water comes out of the rock hot and fills pools at different temperatures, perfect for a long soak. There are private pools, a mud pool and an outdoor pool.",
    "churin.booking.title": "Hot springs by day, a good night's rest",
    "churin.booking.body":
      "Priced per room, taxes included: check the price for your dates. Check-in from 2:00 p.m., check-out by 11:00 a.m.",
    "churin.booking.cta": "Message us on WhatsApp",
    "parking.title": "Free private parking",
    "parking.body":
      "Reserved for guests, with more spaces than the hotel ever needs: there's always a spot, no booking needed.",
    "parking.imageAlt": "Private garage at Hotel Manantial",
    "map.title": "Map of Hotel Manantial in Churín",
    "location.cta": "Open in Google Maps",
    "directions.title": "How to get here from Lima",
    "reviews.label": "Since 2005",
    "reviews.title": "What our guests say",
    "reviews.body": "A family-founded hotel with a 24-hour front desk. Pets welcome.",
    "reviews.raquel":
      "A lovely place with all the services, in a central spot near the plaza and the market. It has parking.",
    "reviews.vrv": "…good value for money. I stayed 2 nights and everything was fine…",
    "reviews.milton":
      "The family atmosphere makes the stay warm and pleasant, ideal both for resting and for sharing special moments…",
    "reviews.date": "September 2026",
    "reviews.translated": "Translated from Spanish",
    "reviews.cta": "See reviews on Google",
    "directions.carLabel": "By car (≈ 4 h):",
    "directions.car": "Panamericana Norte to Huacho, then via Sayán.",
    "directions.busLabel": "By bus:",
    "directions.bus": "several companies leave from Plaza Norte in Lima.",
    "booking.kicker": "Prices for your dates",
    "booking.title": "Book directly with the hotel",
    "booking.body":
      "Check availability and prices for your dates. For assistance with your reservation, contact us on WhatsApp.",
    "booking.cta": "Message us on WhatsApp",
    "whatsapp.prefill": "Hello, I would like to book. Dates: ___ Guests: ___ Room: ___",
    "notFound.metaTitle": "Page not found — Hotel Manantial",
    "notFound.metaDescription": "This page does not exist. Go back to Hotel Manantial.",
    "notFound.title": "The spring does not run through here",
    "notFound.body": "This address has no page. The hotel is still in the same place.",
    "notFound.homeCta": "Back to the hotel",
    "footer.links": "Site links",
    "footer.whatsapp": "WhatsApp",
    "footer.email": "Email",
    "footer.whatsappLabel": "Message us on WhatsApp at {phone}",
    "footer.emailLabel": "Email {email}",
    "footer.addressLabel": "View {address} on Google Maps",
    "footer.socials": "Social",
    "footer.legal": "Legal",
    "footer.privacy": "Privacy information",
    "footer.conditions": "Reservation conditions",
    "reservation.cta": "See prices for your dates",
    "reservation.steps": "Reservation steps",
    "reservation.step.room": "Room",
    "reservation.step.rate": "Rate",
    "reservation.search.checkIn": "Arrival",
    "reservation.search.checkOut": "Departure",
    "reservation.search.adults": "Adults",
    "reservation.search.children": "Children",
    "reservation.search.submit": "Search",
    "reservation.nights.one": "1 night",
    "reservation.nights.other": "{count} nights",
    "reservation.adults.one": "1 adult",
    "reservation.adults.other": "{count} adults",
    "reservation.children.one": "1 child",
    "reservation.children.other": "{count} children",
    "reservation.problem.checkInRequired": "Choose your arrival date.",
    "reservation.problem.checkOutRequired": "Choose your departure date.",
    "reservation.problem.checkInPast": "Choose today or a later date, Peru time.",
    "reservation.problem.sameDayClosed":
      "Online same-day booking has closed for today, Peru time. To arrive today, message us on WhatsApp or ask at the desk.",
    "reservation.problem.checkOutBeforeCheckIn":
      "Departure must be at least one night after arrival.",
    "reservation.problem.tooManyNights": "Online stays can last up to 60 nights.",
    "reservation.problem.invalidDate": "One of the dates isn't valid.",
    "reservation.problem.invalidSearch":
      "We couldn't use this search. Please change it and try again.",
    "reservation.helpPrompt": "Questions? We're happy to help.",
    "reservation.choose.loading": "Checking availability…",
    "reservation.choose.loaded": "Showing rooms for your search.",
    "reservation.choose.missing": "Choose your dates to see prices and availability.",
    "reservation.choose.unavailable.title": "We couldn't check availability right now",
    "reservation.choose.unavailable.body":
      "This is a problem on our side, not a lack of rooms. Your search is kept: try again in a moment, or message us on WhatsApp.",
    "reservation.choose.throttled.title": "Too many searches from your connection",
    "reservation.choose.throttled.body":
      "Everyone on a shared connection shares this limit. Your search is kept: wait a minute and try again, or message us on WhatsApp.",
    "reservation.choose.invalid.title": "Check your search",
    "reservation.choose.retry": "Try again",
    "reservation.room.soldOut": "Sold out",
    "reservation.room.offline":
      "This room can't be reserved online. Message us on {whatsapp} to book it.",
    "reservation.room.chooseDates": "Choose dates",
    "reservation.room.preferredUnavailable":
      "Your preferred room, the {room}, isn't available for this search. We haven't chosen another room for you: pick one below or change your search.",
    "reservation.plan.flexible": "Flexible",
    "reservation.plan.non_refundable": "Non-refundable",
    "reservation.rate.total": "Total for {nights}",
    "reservation.rate.freeUntil": "Free cancellation until {date}",
    "reservation.rate.freeEnded": "No free cancellation for these dates",
    "reservation.rate.noFree": "No free cancellation",
    "reservation.rate.saving": "Save {amount}",
    "reservation.rate.continue": "Continue",
    "reservation.rate.continueLabel": "Continue with {room}, {plan} rate",
    "reservation.rate.due": "Due when booking",
    "reservation.rate.from": "From",
    "reservation.rate.see": "See rates",
    "reservation.rate.choose": "Choose the rate",
    "reservation.rate.photos": "See photos",
    "reservation.rate.hidePhotos": "Hide photos",
    "reservation.offer.total": "Stay total",
    "reservation.offer.now": "Pay now",
    "reservation.offer.remaining": "Pay at the hotel",
    "reservation.offer.taxes": "Prices in {currency}, taxes included.",
    "reservation.cancel.available":
      "Free cancellation through {date}, inclusive (Peru time). After that, cancelling or not arriving costs the first night: {amount}.",
    "reservation.cancel.ended":
      "Free cancellation has already ended for these dates. Cancelling or not arriving costs the first night: {amount}.",
    "reservation.cancel.none":
      "No free cancellation. Cancelling or not arriving is charged the full stay, {amount}, with no other penalty.",
    "reservation.cancel.settlement":
      "Late-cancellation and no-show charges come out of what you paid. Any amount owed back to you is arranged with the hotel: a refund or, if you agree, credit for a future stay.",
    "reservation.choose.noOffers.title": "No room can be reserved online for this search",
    "reservation.choose.reason.sold_out": "{rooms}: sold out for these dates. Try other dates.",
    "reservation.choose.reason.too_many_guests":
      "{rooms}: not enough room for your group. Each online reservation is for one room: search with fewer guests and reserve each room separately.",
    "reservation.choose.reason.offline":
      "{rooms}: not bookable online. Message us on WhatsApp to book.",
    "reservation.meta.reviewTitle": "Review your reservation | Hotel Manantial",
    "reservation.meta.reviewDescription":
      "Check your stay, price and terms, and add the booking contact's details.",
    "reservation.step.review": "Pay",
    "reservation.review.title": "Review your reservation",
    "reservation.review.lead": "Confirm your stay, then enter your details to pay.",
    "reservation.review.unavailableLead": "Review the details of your stay below.",
    "reservation.review.checkIn": "Check-in",
    "reservation.review.checkOut": "Check-out",
    "reservation.review.dueNow": "Due today",
    "reservation.review.balance": "Balance at the hotel",
    "reservation.review.whatsapp.title": "Let's finish on WhatsApp",
    "reservation.review.whatsapp.body":
      "Online payment is temporarily unavailable. Send us your stay details and we'll help you book, without filling out a form here.",
    "reservation.review.whatsapp.button": "Continue on WhatsApp",
    "reservation.review.whatsapp.newTab": "opens in a new tab",
    "reservation.review.whatsapp.note":
      "This page does not confirm a reservation. Confirm your booking and arrange payment with the hotel on WhatsApp.",
    "reservation.review.whatsapp.message":
      "Hello! I'd like to book this stay.\nRoom: {room}\nCheck-in: {checkIn}\nCheck-out: {checkOut}\nGuests: {guests}\nRate: {plan}\nStay total: {total}\nCan you confirm availability and payment arrangements?",
    "reservation.review.loading": "Preparing your price…",
    "reservation.review.loaded": "Your price and terms are ready.",
    "reservation.review.stay": "Your stay",
    "reservation.review.room": "Room",
    "reservation.review.dates": "Dates",
    "reservation.review.guests": "Guests",
    "reservation.review.plan": "Rate",
    "reservation.review.price": "Price and terms",
    "reservation.review.contact": "Booking contact",
    "reservation.review.alternativeBooking": "Prefer to book by phone or WhatsApp?",
    "reservation.review.call": "Call us",
    "reservation.review.bookViaWhatsapp": "Book via WhatsApp",
    "reservation.review.contactLead":
      "We'll use these details to manage your reservation and payment and to contact you about your stay. {privacy}.",
    "reservation.review.privacyLink": "Privacy information",
    "reservation.review.conditionsLink": "Reservation conditions",
    "reservation.review.fullName": "Full name",
    "reservation.review.email": "Email",
    "reservation.review.phone": "Phone",
    "reservation.review.phoneCountry": "Country and calling code: {name} ({code})",
    "reservation.review.phoneCountrySearch": "Search countries",
    "reservation.review.phoneCountryEmpty": "No countries found.",
    "reservation.review.cancellationEnded": "Free cancellation has ended",
    "reservation.review.lateCancellationCharge":
      "Cancellation or no-show costs the first night: {amount}.",
    "reservation.review.nonRefundableCancellation":
      "Cancellation or no-show: the full stay amount of {amount} is charged. No additional penalty.",
    "reservation.review.notes": "Notes (optional)",
    "reservation.review.error.phoneTooShort":
      "The phone number is too short. For a landline, include the area code.",
    "reservation.review.error.phoneTooLong": "The phone number is too long.",
    "reservation.review.error.phoneExtension": "Enter a phone number without an extension.",
    "reservation.review.error.notesTooLong": "Keep your notes to 2000 characters or fewer.",
    "reservation.review.terms": "Reservation terms",
    "reservation.review.termsLink": "reservation terms",
    "reservation.review.closeTerms": "Close",
    "reservation.review.nightly": "Price per night",
    "reservation.review.schedule.flexible":
      "Payment: the first night, {now}, is paid online; the remaining {remaining} is paid at the hotel.",
    "reservation.review.schedule.non_refundable":
      "Payment: the whole stay, {now}, is paid online; nothing is left to pay at the hotel.",
    "reservation.review.lifecycle":
      "This price was calculated when you opened this page and is kept for a few minutes. If it needs updating before payment, you'll see the new terms before anything is charged. The room is reserved only once payment is confirmed and the reservation is saved.",
    "reservation.review.agree":
      "I accept the {terms}, including the cancellation and no-show conditions.",
    "reservation.review.saving": "Preparing your payment…",
    "reservation.review.payment": "Payment",
    "reservation.pay.provider": "Card payment is processed by Culqi.",
    "reservation.pay.security": "Security check before payment",
    "reservation.pay.button": "Pay {amount}",
    "reservation.pay.busy": "Processing…",
    "reservation.pay.sending": "Sending your payment… Please wait on this page.",
    "reservation.pay.error.security": "Wait for the security check above to finish, then pay.",
    "reservation.pay.error.securityFailed":
      "The security check didn't pass and nothing was charged. Complete the check again, then pay.",
    "reservation.pay.error.securityUnavailable":
      "The payment security check isn't available right now. Nothing was charged and your details are kept: try again in a moment, or message us on WhatsApp.",
    "reservation.pay.error.paused":
      "Online payments are paused right now. Nothing was charged, and your details and accepted terms are kept on this page. Try again later, or message us on WhatsApp to reserve.",
    "reservation.pay.error.throttled":
      "Too many payment attempts from your connection or for this reservation. Nothing was charged and your details are kept: wait a minute and try again.",
    "reservation.pay.changed":
      "The price or terms changed, so nothing was charged. Review them and accept again before paying.",
    "reservation.pay.error.limited":
      "This review can't record another agreement, so nothing was charged. Your details stay on this page. Message us on WhatsApp to reserve.",
    "reservation.pay.error.card":
      "The card form couldn't open. Nothing was charged: check your connection and try again.",
    "reservation.pay.error.unavailable":
      "We couldn't send your payment and nothing was charged. Your details are kept: try again in a moment, or message us on WhatsApp.",
    "reservation.pay.error.retry":
      "The payment didn't go through and nothing was charged. Your details are kept on this page: please pay again.",
    "reservation.outcome.submitted.title": "Payment sent, checking its status",
    "reservation.outcome.submitted.body":
      "We sent your payment but didn't receive an answer, so your card may have been charged. Please don't pay again: check its status here, or message us on WhatsApp or by email for help.",
    "reservation.outcome.reservation_changed.title": "Your reservation was updated by the hotel",
    "reservation.outcome.reservation_changed.body":
      "Your payment was received, and the hotel has since changed this reservation. Message us on WhatsApp or by email with your reference to confirm its current status.",
    "reservation.outcome.declined.title": "Your card was declined",
    "reservation.outcome.declined.body":
      "Nothing was charged. You can try paying with another card.",
    "reservation.outcome.authentication_required.title": "Your bank needs to verify this payment",
    "reservation.outcome.authentication_required.body":
      "To complete the payment, finish your bank's verification. If you closed the window, you can open it again.",
    "reservation.outcome.authentication_required.eyebrow": "Verification pending",
    "reservation.outcome.authentication_required.reassurance":
      "Continue with the same card. Do not pay again.",
    "reservation.outcome.authentication_required.amount": "Pending payment",
    "reservation.outcome.declined.eyebrow": "Payment not completed",
    "reservation.outcome.declined.reassurance": "Your details and accepted terms are kept.",
    "reservation.outcome.declined.amount": "Amount to pay",
    "reservation.outcome.authentication_expired.title": "Your bank verification expired",
    "reservation.outcome.authentication_expired.body":
      "Verification was left unfinished and this payment attempt was closed. No charge was made.",
    "reservation.outcome.authentication_expired.eyebrow": "Verification expired",
    "reservation.outcome.authentication_expired.reassurance":
      "Your details are kept. We will check the price again before payment.",
    "reservation.outcome.authentication_expired.amount": "Previous payment attempt",
    "reservation.outcome.contactSaved": "Contact saved · terms accepted",
    "reservation.outcome.processing.title": "Confirming your payment",
    "reservation.outcome.processing.body":
      "We're verifying your payment with the card processor. Please don't pay again: verification continues even if you close this page.",
    "reservation.outcome.processing.delayed":
      "Verification is taking longer than usual. It continues even if you close this page, so please don't pay again. Check the status here later, or message us on WhatsApp or by email for help.",
    "reservation.outcome.paid_awaiting_reservation.title":
      "Payment received, saving your reservation",
    "reservation.outcome.paid_awaiting_reservation.body":
      "Your payment was received and we're saving your reservation. It isn't confirmed until it's saved, so please don't pay again.",
    "reservation.outcome.unfulfilled.title":
      "Payment received, but your reservation couldn't be confirmed",
    "reservation.outcome.unfulfilled.body":
      "We received your payment, but no room could be reserved for these dates, so you don't have a reservation. The amount awaiting resolution hasn't been refunded yet: message us on WhatsApp or by email with your support reference and the hotel will arrange it with you.",
    "reservation.outcome.confirmed.title": "Your reservation is confirmed",
    "reservation.outcome.confirmed.body":
      "Keep your reference. Any outstanding balance is paid at the hotel.",
    "reservation.outcome.reference": "Reference",
    "reservation.outcome.supportReference": "Support reference",
    "reservation.outcome.amount": "Payment amount",
    "reservation.outcome.paid": "Paid",
    "reservation.outcome.received": "Received",
    "reservation.outcome.outstanding": "Outstanding balance",
    "reservation.outcome.awaiting": "Awaiting resolution",
    "reservation.outcome.retry": "Pay with another card",
    "reservation.outcome.verifyBank": "Open bank verification",
    "reservation.outcome.check": "Check status",
    "reservation.outcome.checking": "Checking your payment…",
    "reservation.meta.summaryTitle": "Reservation summary | Hotel Manantial",
    "reservation.meta.summaryDescription":
      "A private, limited summary of one reservation. Anyone holding the link can view it.",
    "reservation.summary.title": "Reservation summary",
    "reservation.summary.loading": "Opening the reservation summary…",
    "reservation.summary.possession":
      "Anyone holding this link can view this limited summary. Share it only with people who should see the stay.",
    "reservation.summary.copy": "Copy link",
    "reservation.access.atHotel": "The outstanding balance is payable at the hotel.",
    "reservation.access.loading": "Loading your reservation link…",
    "reservation.access.unavailable.confirmed":
      "Your reservation is confirmed. We couldn’t load the link; you can try again whenever you like.",
    "reservation.access.unavailable.saved":
      "This reservation outcome is saved, but its link could not be loaded. Try again or contact the hotel using your reference.",
    "reservation.access.retry": "Try again",
    "reservation.access.view": "View reservation",
    "reservation.confirmation.paymentLabel": "Payment and balance",
    "reservation.confirmation.welcome": "See you in Churín.",
    "reservation.confirmation.accessTitle": "Your stay, close at hand",
    "reservation.confirmation.accessBody":
      "Keep your stay details handy and start looking forward to your trip.",
    "reservation.confirmation.helpTitle": "We’re here to help",
    "reservation.confirmation.helpBody": "Have a question or need a change? We’re happy to help.",
    "reservation.confirmation.call": "Call the hotel",
    "reservation.confirmation.whatsapp": "Message on WhatsApp",
    "reservation.confirmation.printLabel": "Printable confirmation",
    "reservation.confirmation.printStatus": "Reservation confirmed",
    "reservation.confirmation.printTitle": "Reservation confirmation",
    "reservation.confirmation.printWelcome": "We look forward to welcoming you to Churín.",
    "reservation.confirmation.duration": "Duration",
    "reservation.confirmation.payment": "Payment for your stay",
    "reservation.confirmation.thanks": "Thank you for choosing Hotel Manantial.",
    "reservation.confirmation.printHelp":
      "We’re here to help with any questions or changes to your reservation.",
    "reservation.confirmation.preparing": "Preparing…",
    "reservation.confirmation.print": "Print confirmation",

    "reservation.summary.copied": "Link copied",
    "reservation.summary.staff":
      "Changes, cancellations and refunds are arranged with the hotel. This page cannot change the reservation, and it does not send an email.",
    "reservation.summary.unavailable.title": "The reservation summary could not be loaded",
    "reservation.summary.unavailable.body":
      "We could not load your reservation right now. Try again or contact the hotel for help.",
    "reservation.summary.unavailable.refresh":
      "We could not refresh your reservation summary. Try again to see the current details, or contact the hotel for help.",
    "reservation.summary.retry": "Try again",
    "reservation.summary.assistance.title": "The hotel can help with this reservation",
    "reservation.summary.assistance.body":
      "This link is invalid or has expired, so no reservation details are shown. Call, email or message the hotel and staff can help.",
    "reservation.summary.phone": "Call the hotel",
    "reservation.summary.email": "Email the hotel",
    "reservation.summary.whatsapp": "WhatsApp",
    "reservation.summary.whatsappPrefill": "Hello, I need help with a reservation.",
    "reservation.summary.emailSubject": "Reservation help",
    "reservation.summary.status": "Status",
    "reservation.summary.status.confirmed": "Confirmed",
    "reservation.summary.status.checked_in": "Checked in",
    "reservation.summary.status.checked_out": "Checked out",
    "reservation.summary.status.cancelled": "Cancelled",
    "reservation.summary.status.no_show": "No-show",
    "reservation.summary.status.unfulfilled": "Payment received, reservation not confirmed",
    "reservation.summary.contact": "Booking contact",
    "reservation.summary.nights": "Nights",
    "reservation.summary.total": "Total",
    "reservation.summary.refundDue": "Refund due",
    "reservation.summary.refunded": "Refunded",
    "reservation.summary.roomUnknown": "Room",
    "reservation.summary.accepted.flexible":
      "Accepted agreement: free cancellation was through {date}. The agreed charge after that date is {amount}.",
    "reservation.summary.accepted.none":
      "Accepted agreement: no free cancellation. The agreed charge is {amount}.",
    "reservation.summary.planUnknown": "Rate",
    "reservation.review.changed":
      "The price or terms for your stay changed. Review them and accept again.",
    "reservation.review.error.fullName": "Enter the booking contact's full name.",
    "reservation.review.error.email": "Enter a valid email, like name@example.com.",
    "reservation.review.error.phone": "Enter a phone number.",
    "reservation.review.error.phoneInvalid":
      "This phone number isn't valid for the selected country.",
    "reservation.review.error.agree": "Check the box to accept the terms.",
    "reservation.review.error.invalid": "We couldn't save these details. Check them and try again.",
    "reservation.review.limited.title": "This review was changed too many times",
    "reservation.review.limited.body":
      "Your details are kept. Try again to start a fresh review of the same choice, or message us on WhatsApp.",
    "reservation.review.error.throttled":
      "Too many attempts from your connection. Your details are kept: wait a minute and try again.",
    "reservation.review.error.unavailable":
      "We couldn't save your acceptance right now. Your details are kept: please try again.",
    "reservation.review.missing.title": "Choose a room and rate first",
    "reservation.review.missing.body":
      "We couldn't find your choice. Go back and choose a room and rate for your dates.",
    "reservation.review.soldOut.title": "This room is no longer available for these dates",
    "reservation.review.soldOut.body":
      "{room} is no longer available for these dates. Your search and details are kept. Go back to see which rooms are still available; we won't pick another one for you.",
    "reservation.review.throttled.title": "Too many price requests from your connection",
    "reservation.review.throttled.body":
      "Everyone on a shared connection shares this limit. Your choice and details are kept: wait a minute and try again, or message us on WhatsApp.",
    "reservation.review.unavailable.title": "We couldn't prepare your price right now",
    "reservation.review.unavailable.body":
      "This is a problem on our side. Your choice and details are kept: try again in a moment, or message us on WhatsApp.",
    "reservation.review.invalid.title": "This choice can't be reserved online",
    "reservation.review.problem.tooManyGuests":
      "This room doesn't fit your group. Go back and choose another room or change the guests.",
  },
  es: {
    "complaints.securityCheck": "Verificación de seguridad",
    "complaints.securityFailed":
      "Complete la verificación de seguridad e inténtelo de nuevo. Se conserva su borrador.",
    "complaints.securityUnavailable":
      "La verificación de seguridad no está disponible. Se conserva su borrador; inténtelo de nuevo.",
    "complaints.retrySecurityCheck": "Reintentar verificación",

    "complaints.optionalEmailLabel": "Correo electrónico (opcional)",
    "complaints.referenceHint": "Si no tiene una reserva, escriba «No aplica».",
    "complaints.amountLabel": "Monto (opcional)",
    "complaints.amountHint": "Déjelo vacío si no se conoce o no aplica.",
    "complaints.consumerDetails": "1. Datos del consumidor",
    "complaints.complaintDetails": "2. Datos de la reclamación",
    "complaints.writtenResponse": "3. Respuesta escrita",
    "complaints.optionalEmail": "Opcional si elige una respuesta por carta.",

    "complaints.field.fullName": "Nombre completo",
    "complaints.field.address": "Domicilio",
    "complaints.field.documentType": "Tipo de documento",
    "complaints.field.documentNumber": "Número de documento",
    "complaints.field.phone": "Teléfono",
    "complaints.field.email": "Correo electrónico",
    "complaints.field.representative":
      "Padre o representante: nombre, documento, domicilio y contacto",
    "complaints.field.product": "Producto o servicio",
    "complaints.field.amount": "Monto (opcional; dejar vacío si no se conoce o no aplica)",
    "complaints.field.category": "Tipo",
    "complaints.field.description": "Detalle",
    "complaints.field.requestedRemedy": "Pedido",
    "complaints.field.reservationReference": "Referencia de reserva",
    "complaints.field.responseChannel": "Canal de respuesta escrita",
    "complaints.field.minor": "Consumidor menor de edad",
    "complaints.error.complaint_privacy_information_changed":
      "La información de privacidad cambió. Recargue la página para revisarla; se conserva el borrador.",
    "complaints.error.complaint_retry_differs_from_saved_sheet":
      "Este envío ya tiene una hoja registrada. Recupere la constancia antes de enviar otra.",
    "complaints.error.invalid_complaint_receipt_credential":
      "No se encontró una constancia para este envío.",
    "complaints.error.invalid_complaint_fields": "Revise los campos indicados.",
    "complaints.error.minor_representative_is_required":
      "Ingrese los datos del padre o representante.",
    "complaints.error.response_email_is_required": "Ingrese un correo para la respuesta escrita.",
    "complaints.error.too_many_complaints_retry_in_one_minute":
      "Espere un minuto y reintente el mismo envío. Se conserva el borrador.",
    "complaints.sheet.title": "Hoja de Reclamación",
    "complaints.sheet.number": "Nº",
    "complaints.sheet.date": "Fecha",
    "complaints.sheet.identificationCode": "Código de identificación",
    "complaints.sheet.consumer": "1. Identificación del consumidor reclamante",
    "complaints.sheet.goods": "2. Identificación del bien contratado",
    "complaints.sheet.detail": "3. Detalle de la reclamación y pedido del consumidor",
    "complaints.sheet.provider": "4. Observaciones y acciones adoptadas por el proveedor",
    "complaints.sheet.responseDate": "Fecha de comunicación de la respuesta",
    "complaints.sheet.yes": "Sí",
    "complaints.sheet.no": "No",
    "complaints.sheet.reclamoDefinition":
      "Reclamo: disconformidad relacionada a los productos o servicios.",
    "complaints.sheet.quejaDefinition":
      "Queja: disconformidad no relacionada a los productos o servicios; o, malestar o descontento respecto a la atención al público.",
    "complaints.sheet.otherRemedies":
      "La formulación del reclamo no impide acudir a otras vías de solución de controversias ni es requisito previo para interponer una denuncia ante el INDECOPI.",
    "complaints.sheet.deadline":
      "El proveedor debe dar respuesta al reclamo o queja en un plazo no mayor a quince (15) días hábiles, el cual es improrrogable.",
    "complaints.sheet.recipient": "Destinatario: consumidor",
    "complaints.registered": "Registrado",
    "complaints.filed": "Presentado",
    "complaints.responseDeadline": "Fecha límite de respuesta",
    "complaints.unknownNotApplicable": "No conocido / no aplica",
    "complaints.privacyPolicyVersion": "Versión de privacidad",
    "complaints.emailSubmittedDeliveryIsNotConfirmed":
      "Correo enviado al proveedor; entrega no confirmada.",
    "complaints.emailQueuedDeliveryIsNotConfirmed": "Correo en cola; entrega no confirmada.",
    "complaints.emailFailedYourSheetRemainsRegisteredDo":
      "Falló el correo. Su hoja sigue registrada. No la vuelva a presentar.",
    "complaints.noAutomaticEmailRequested": "Sin correo automático.",
    "complaints.printSheet": "Imprimir hoja",
    "complaints.couldNotRegisterTheSheetYourDraft":
      "No se pudo registrar la hoja. Su borrador se conserva; reintente el mismo envío.",
    "complaints.yourDraftIsRetainedRetryTheSame":
      "Se conserva el borrador. Reintente el mismo envío para recuperar su constancia.",
    "complaints.networkErrorYourDraftIsRetainedRetry":
      "Error de red. Se conserva el borrador; reintente el mismo envío.",
    "complaints.startAnotherSheetSaveOrPrintThis":
      "Iniciar otra hoja (guarde o imprima esta primero)",
    "complaints.recoveringReceipt": "Recuperando su hoja registrada…",
    "complaints.fullPrivacyInformation": "Información completa de privacidad",
    "complaints.privacyPage": "Información de privacidad de todos nuestros servicios",
    "complaints.consumerAndComplaintDetails": "Datos del consumidor y de la reclamación",
    "complaints.email": "Correo electrónico",
    "complaints.letterToTheAddressProvided": "Carta al domicilio indicado",
    "complaints.registering": "Registrando…",
    "complaints.retrySameSubmission": "Reintentar el mismo envío",
    "complaints.registerSheet": "Registrar hoja",

    "nav.home": "Inicio",
    "nav.rooms": "Habitaciones y precios",
    "nav.churin": "Churín",
    "nav.book": "Reservar",
    "nav.primary": "Navegación principal",
    "nav.mobile": "Navegación móvil",
    "menu.open": "Abrir menú",
    "menu.close": "Cerrar menú",
    "languageSelect.accessibleLabel": "Seleccionar idioma",
    "brand.name": "Hotel Manantial",
    "brand.subtitle": "Churín, Perú",
    skipToContent: "Saltar al contenido principal",
    "meta.title": "Hotel Manantial — Hotel en Churín, Perú",
    "meta.description":
      "Hospédese en Hotel Manantial en Churín, Perú, a 5 minutos en auto de las aguas termales de Mamahuarmi y La Juventud.",
    "meta.home.title": "Hotel en Churín con cochera, cerca de las termas | Hotel Manantial",
    "meta.home.description":
      "Hotel en Churín a 5 min en auto de las termas de Mamahuarmi y La Juventud. Cochera gratis, baño privado y recepción 24 h. Consulte precios y reserve directo.",
    "meta.rooms.title": "Habitaciones y precios en Churín | Hotel Manantial",
    "meta.rooms.description":
      'Suite matrimonial, doble premium y suite familiar en Churín, con precio por habitación e impuestos incluidos. Smart TV 55", recepción 24 h y cochera gratis.',
    "meta.churin.title": "Termas de Churín: guía y cómo llegar | Hotel Manantial",
    "meta.churin.description":
      "Guía de Mamahuarmi, La Juventud y Tingo y cómo llegar a Churín desde Lima (≈ 4 h). Hotel Manantial: termas a pie y la plaza a 3 min.",
    "meta.ogImageAlt":
      "Hotel Manantial, Churín, Perú. Suite Matrimonial con cama king, en un piso alto con balcón.",
    "hero.title": "Hotel en Churín a 5 minutos en auto de las termas",
    "hero.benefits": "Servicios del hotel",
    "hero.parking": "Cochera gratuita",
    "hero.bathroom": "Baño privado",
    "hero.reception": "Recepción 24 horas",
    "hero.bookCta": "Consultar disponibilidad",
    "hero.roomsCta": "Ver habitaciones y precios",
    "hero.imageAlt": "Habitación del Hotel Manantial en Churín",
    "landing.arrivalPlaceholder": "Elegir llegada",
    "landing.departurePlaceholder": "Elegir salida",
    "landing.chooseArrival": "Elija su fecha de llegada",
    "landing.chooseDeparture": "Elija su fecha de salida",
    "landing.stayHint": "Seleccione las fechas de llegada y salida.",
    "landing.closeCalendar": "Cerrar calendario",
    "landing.closeGuests": "Cerrar huéspedes",
    "landing.guests": "Huéspedes",
    "landing.decreaseAdults": "Reducir adultos",
    "landing.increaseAdults": "Aumentar adultos",
    "landing.decreaseChildren": "Reducir niños",
    "landing.increaseChildren": "Aumentar niños",
    "rooms.title": "Suite Matrimonial",
    "rooms.body":
      "Cama king, baño privado y Wi-Fi. También contamos con Doble Premium y Suite Familiar. Precio por habitación, no por persona.",
    "rooms.cta": "Ver todos los tipos de habitación",
    "rooms.imageAlt": "Suite matrimonial del Hotel Manantial",
    "rooms.pageTitle": "Habitaciones y precios en Churín",
    "rooms.king.name": "Suite Matrimonial",
    "rooms.king.lead":
      "Para dos, o para padres con un niño pequeño. Nuestra habitación más económica, con la misma cama king que la Suite Familiar.",
    "rooms.king.beds": "1 cama king",
    "rooms.photo.king": "Habitación con cama king, Smart TV y balcón en Hotel Manantial, Churín",
    "rooms.double.name": "Doble Premium",
    "rooms.double.lead":
      "Para amigos o compañeros de viaje que prefieren no compartir cama: cada uno tiene la suya, de 2 plazas.",
    "rooms.double.beds": "2 camas de 2 plazas",
    "rooms.king.area": "18 m²",
    "rooms.double.area": "20 m²",
    "rooms.family.area": "22 m²",
    "rooms.photo.kingFrontView":
      "Vista frontal de la suite matrimonial con Smart TV y balcón en Hotel Manantial, Churín",
    "rooms.photo.doubleSide":
      "Dos camas, ventana y televisor en la habitación doble premium del Hotel Manantial, Churín",
    "rooms.photo.doubleTop":
      "Dos camas y área de descanso en la habitación doble premium del Hotel Manantial, Churín",
    "rooms.photo.doubleClose":
      "Vista cercana de las dos camas en la habitación doble premium del Hotel Manantial, Churín",
    "rooms.family.name": "Suite Familiar",
    "rooms.family.lead":
      "Para padres que viajan con un hijo mayor, que tiene su propia cama. La habitación más amplia del hotel.",
    "rooms.family.beds": "1 cama king y 1 individual",
    "rooms.photo.familyFront":
      "Cama king y cama individual en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.familySide":
      "Vista lateral de la cama king y la cama individual en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.familyClose":
      "Vista cercana de las dos camas en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.kingBalcony":
      "Cama king junto al balcón en una habitación del Hotel Manantial, Churín",
    "rooms.gallery.label": "Fotos de {room}",
    "rooms.gallery.open": "Abrir foto",
    "rooms.gallery.show": "Mostrar foto {position}",
    "rooms.gallery.of": "de",
    "rooms.gallery.previous": "Foto anterior",
    "rooms.gallery.next": "Foto siguiente",
    "rooms.gallery.close": "Cerrar",
    "rooms.included.title": "En todas las habitaciones",
    "rooms.included.bathroom": "Baño privado con agua caliente",
    "rooms.included.towels": "Toallas y artículos de aseo",
    "rooms.included.tv": 'Smart TV 55" 4K',
    "rooms.included.wifi": "Wi-Fi",
    "rooms.included.views": "Vistas variadas",
    "rooms.hotel.title": "En el hotel",
    "rooms.hotel.reception": "Recepción 24 horas",
    "rooms.hotel.elevator": "Ascensor",
    "rooms.hotel.parking": "Cochera privada gratis",
    "rooms.card.sleeps": "Hasta {count} personas",
    "rooms.card.wifi": "Wi-Fi gratis",
    "rooms.details.open": "Detalles de la habitación",
    "rooms.details.close": "Cerrar detalles de la habitación",
    "rooms.policies.checkInTitle": "Entrada y salida",
    "rooms.policies.checkIn": "Entrada (check-in)",
    "rooms.policies.checkInValue": "Desde las 2:00 p. m.",
    "rooms.policies.checkOut": "Salida (check-out)",
    "rooms.policies.checkOutValue": "Hasta las 11:00 a. m.",
    "rooms.policies.breakfast": "Desayuno",
    "rooms.policies.breakfastValue": "El hotel no ofrece servicio de desayuno.",
    "rooms.policies.cancelTitle": "Cancelación",
    "rooms.policies.cancelFlexibleBody":
      "Tarifa Flexible: puede cancelar sin cargo hasta dos días calendario antes de su fecha de llegada, inclusive, según la hora de Perú. Si cancela después de este plazo o no se presenta, se cobrará el importe de la primera noche de alojamiento.",
    "rooms.policies.cancelNonRefundableBody":
      "Tarifa No reembolsable: el importe total de la estadía se abona al reservar. Si cancela o no se presenta, se cobra el total de la estadía y no se devuelve lo pagado, salvo que el hotel no pueda prestar el servicio o haya un pago en exceso.",
    "rooms.policies.petsTitle": "Mascotas",
    "rooms.policies.petsBody":
      "Se admiten mascotas. Si viaja con una mascota, infórmenos al realizar su reserva.",
    "rooms.policies.conditionsLink": "Condiciones de reserva completas, cambios y devoluciones",
    "rooms.policies.paymentTitle": "Pago en el hotel",
    "rooms.policies.paymentBody":
      "Si queda un saldo pendiente de su estadía, deberá abonarlo al realizar el check-in. Aceptamos efectivo, tarjetas, Yape y transferencias bancarias. El pago en el hotel no sustituye el pago inicial requerido para confirmar su reserva.",
    "churin.title": "Las termas y el centro, a pie",
    "churin.body":
      "El mercado municipal está al lado y la Plaza de Armas, a 3 minutos a pie. A La Juventud y Mamahuarmi se llega caminando en unos 11 y 13 minutos.",
    "churin.cta": "Guía de las termas de Churín",
    "churin.imageAlt": "Plaza de Armas de Churín",
    "churin.pageTitle": "Termas de Churín: guía práctica para su visita",
    "churin.deck":
      "Churín, capital del distrito de Pachangara (Oyón, Lima), está junto al río Huaura.",
    "churin.intro":
      "Se viene por sus aguas termales, y desde Hotel Manantial puede ir a pie a Mamahuarmi y La Juventud. La Plaza de Armas está a 3 minutos caminando.",
    "churin.bookCta": "Consultar disponibilidad",
    "churin.centerTitle": "El centro de Churín",
    "churin.roadTitle": "Cómo llegar desde Lima",
    "churin.roadCarLabel": "En auto, la opción preferida por la mayoría:",
    "churin.roadCar":
      "Panamericana Norte hasta Huacho, luego la carretera por Sayán hasta Churín. Al llegar, deje el auto en nuestra cochera privada, gratis para huéspedes.",
    "churin.roadBusLabel": "En bus:",
    "churin.roadBus": "varias empresas viajan a Churín desde Plaza Norte, en Lima.",
    "churin.roomsCta": "Ver habitaciones y precios",
    "churin.fact.altitude": "Altitud",
    "churin.fact.altitudeValue": "2.258 m",
    "churin.fact.fromLima": "Desde Lima",
    "churin.fact.fromLimaValue": "207 km",
    "churin.fact.driveTime": "En auto",
    "churin.fact.driveTimeValue": "≈ 4 h",
    "churin.fact.baths": "Aguas",
    "churin.fact.temp": "30 °C a 55 °C",
    "churin.center":
      "El mercado municipal está justo al lado del hotel, y la Plaza de Armas y el resto del centro se recorren fácilmente caminando. Pruebe la trucha, el plato que encontrará en casi todas las cartas del pueblo. Por la altura, las noches son frescas: lleve una casaca ligera para el regreso.",
    "churin.bathsTitle": "Las termas",
    "churin.bathsLead":
      "Cada complejo tiene pozas a distintas temperaturas, así que puede elegir qué tan caliente la quiere.",
    "churin.mamahuarmi.imageAlt": "Pozas al aire libre de Mamahuarmi",
    "churin.mamahuarmi.drive": "Unos 13 min a pie o 5 min en auto",
    "churin.mamahuarmi.body":
      "Pozas al aire libre de agua turquesa, entre eucaliptos y molles. Las favoritas son la Poza de los Novios y el Velo de la Novia, una pequeña cascada bajo la que puede pararse. Si busca calma, vaya a La Mellicera, la poza más apartada.",
    "churin.juventud.imageAlt": "Poza redonda de La Juventud",
    "churin.juventud.drive": "Unos 11 min a pie o 5 min en auto",
    "churin.juventud.body":
      "A la izquierda al entrar al pueblo. Elija entre las piscinas grandes compartidas o una poza familiar, y no se pierda el chorro a presión que funciona como masaje. Al aire libre están la Poza de la Amistad y la Poza Uchuj.",
    "churin.tingo.imageAlt": "Pozas de las termas de Tingo",
    "churin.tingo.drive": "10 min en auto o transporte local",
    "churin.tingo.body":
      "Pasando el puente Tingo, en la margen derecha del Huaura. El agua brota caliente de la roca y llena pozas a distintas temperaturas, para quedarse un buen rato. Hay pozas privadas, pozo de lodo y piscina al aire libre.",
    "churin.booking.title": "Termas de día, buen descanso de noche",
    "churin.booking.body":
      "Precio por habitación, impuestos incluidos: consulte el precio para sus fechas. Check-in desde las 2:00 p. m. y check-out hasta las 11:00 a. m.",
    "churin.booking.cta": "Escribir por WhatsApp",
    "parking.title": "Cochera privada y gratuita",
    "parking.body":
      "Exclusiva para huéspedes y con más espacios de los que el hotel necesita: siempre hay sitio, sin reservar.",
    "parking.imageAlt": "Cochera privada del Hotel Manantial",
    "map.title": "Mapa del Hotel Manantial en Churín",
    "location.cta": "Abrir en Google Maps",
    "directions.title": "Cómo llegar desde Lima",
    "reviews.label": "Desde 2005",
    "reviews.title": "Lo que dicen nuestros huéspedes",
    "reviews.body": "Un hotel de origen familiar, con recepción 24 horas y mascotas bienvenidas.",
    "reviews.raquel":
      "Bonito lugar con todos los servicios en un lugar céntrico, cerca a la plaza y al mercado, cuenta con cochera.",
    "reviews.vrv": "…buena relación calidad-precio, estuve 2 noches y todo bien…",
    "reviews.milton":
      "El ambiente familiar hace que la estadía sea cálida y agradable, ideal tanto para descansar como para compartir momentos especiales…",
    "reviews.date": "septiembre 2026",
    "reviews.translated": "",
    "reviews.cta": "Ver reseñas en Google",
    "directions.carLabel": "En auto (≈ 4 h):",
    "directions.car": "Panamericana Norte hasta Huacho y luego por Sayán.",
    "directions.busLabel": "En bus:",
    "directions.bus": "varias empresas salen desde Plaza Norte, en Lima.",
    "booking.kicker": "Precios para sus fechas",
    "booking.title": "Reserve directamente con el hotel",
    "booking.body":
      "Consulte disponibilidad y precios para sus fechas. Si necesita asistencia con su reserva, contáctenos por WhatsApp.",
    "booking.cta": "Escribir por WhatsApp",
    "whatsapp.prefill": "Hola, quisiera reservar. Fechas: ___ Personas: ___ Habitación: ___",
    "notFound.metaTitle": "Página no encontrada — Hotel Manantial",
    "notFound.metaDescription": "Esta página no existe. Vuelva al inicio de Hotel Manantial.",
    "notFound.title": "El manantial no pasa por aquí",
    "notFound.body": "Esta dirección no tiene página. El hotel sigue en el mismo sitio.",
    "notFound.homeCta": "Volver al hotel",
    "footer.links": "Enlaces del sitio",
    "footer.whatsapp": "WhatsApp",
    "footer.email": "Correo",
    "footer.whatsappLabel": "Escribir por WhatsApp al {phone}",
    "footer.emailLabel": "Enviar un correo a {email}",
    "footer.addressLabel": "Ver {address} en Google Maps",
    "footer.socials": "Redes",
    "footer.legal": "Legal",
    "footer.privacy": "Información de privacidad",
    "footer.conditions": "Condiciones de reserva",
    "reservation.cta": "Ver precios para sus fechas",
    "reservation.steps": "Pasos de la reserva",
    "reservation.step.room": "Habitación",
    "reservation.step.rate": "Tarifa",
    "reservation.search.checkIn": "Llegada",
    "reservation.search.checkOut": "Salida",
    "reservation.search.adults": "Adultos",
    "reservation.search.children": "Niños",
    "reservation.search.submit": "Buscar",
    "reservation.nights.one": "1 noche",
    "reservation.nights.other": "{count} noches",
    "reservation.adults.one": "1 adulto",
    "reservation.adults.other": "{count} adultos",
    "reservation.children.one": "1 niño",
    "reservation.children.other": "{count} niños",
    "reservation.problem.checkInRequired": "Elija su fecha de llegada.",
    "reservation.problem.checkOutRequired": "Elija su fecha de salida.",
    "reservation.problem.checkInPast": "Elija hoy o una fecha posterior, hora de Perú.",
    "reservation.problem.sameDayClosed":
      "Las reservas en línea para llegar hoy cerraron, hora de Perú. Para llegar hoy, escríbanos por WhatsApp o en recepción.",
    "reservation.problem.checkOutBeforeCheckIn":
      "La salida debe ser al menos una noche después de la llegada.",
    "reservation.problem.tooManyNights": "Las estadías en línea pueden durar hasta 60 noches.",
    "reservation.problem.invalidDate": "Una de las fechas no es válida.",
    "reservation.problem.invalidSearch":
      "No pudimos usar esta búsqueda. Cámbiela e intente de nuevo.",
    "reservation.helpPrompt": "¿Dudas? Con gusto le ayudamos.",
    "reservation.choose.loading": "Consultando disponibilidad…",
    "reservation.choose.loaded": "Mostrando habitaciones para su búsqueda.",
    "reservation.choose.missing": "Elija sus fechas para ver precios y disponibilidad.",
    "reservation.choose.unavailable.title":
      "No pudimos consultar la disponibilidad en este momento",
    "reservation.choose.unavailable.body":
      "Es un problema de nuestro sistema, no falta de habitaciones. Su búsqueda se conserva: intente de nuevo en un momento o escríbanos por WhatsApp.",
    "reservation.choose.throttled.title": "Demasiadas búsquedas desde su conexión",
    "reservation.choose.throttled.body":
      "Quienes comparten una conexión comparten este límite. Su búsqueda se conserva: espere un minuto e intente de nuevo, o escríbanos por WhatsApp.",
    "reservation.choose.invalid.title": "Revise su búsqueda",
    "reservation.choose.retry": "Intentar de nuevo",
    "reservation.room.soldOut": "Agotada",
    "reservation.room.offline":
      "Esta habitación no se puede reservar en línea. Escríbanos por {whatsapp} para reservarla.",
    "reservation.room.chooseDates": "Elegir fechas",
    "reservation.room.preferredUnavailable":
      "Su habitación preferida, {room}, no está disponible para esta búsqueda. No elegimos otra por usted: elija una abajo o cambie su búsqueda.",
    "reservation.plan.flexible": "Flexible",
    "reservation.plan.non_refundable": "No reembolsable",
    "reservation.rate.total": "Total por {nights}",
    "reservation.rate.freeUntil": "Cancelación gratuita hasta el {date}",
    "reservation.rate.freeEnded": "Sin cancelación gratuita para estas fechas",
    "reservation.rate.noFree": "Sin cancelación gratuita",
    "reservation.rate.saving": "Ahorre {amount}",
    "reservation.rate.continue": "Continuar",
    "reservation.rate.continueLabel": "Continuar con {room}, tarifa {plan}",
    "reservation.rate.due": "A pagar al reservar",
    "reservation.rate.from": "Desde",
    "reservation.rate.see": "Ver tarifas",
    "reservation.rate.choose": "Elija la tarifa",
    "reservation.rate.photos": "Ver fotos",
    "reservation.rate.hidePhotos": "Ocultar fotos",
    "reservation.offer.total": "Total de la estadía",
    "reservation.offer.now": "Pago ahora",
    "reservation.offer.remaining": "Pago en el hotel",
    "reservation.offer.taxes": "Precios en {currency}, impuestos incluidos.",
    "reservation.cancel.available":
      "Cancelación gratuita hasta el {date} inclusive (hora de Perú). Después, si cancela o no llega, se cobra la primera noche: {amount}.",
    "reservation.cancel.ended":
      "Para estas fechas ya no hay cancelación gratuita. Si cancela o no llega, se cobra la primera noche: {amount}.",
    "reservation.cancel.none":
      "Sin cancelación gratuita. Si cancela o no llega, se cobra toda la estadía, {amount}, sin otra penalidad.",
    "reservation.cancel.settlement":
      "Los cargos por cancelación tardía o por no llegar se descuentan de lo pagado. Cualquier saldo a su favor se coordina con el hotel: un reembolso o, si usted acepta, un crédito para una estadía futura.",
    "reservation.choose.noOffers.title":
      "Ninguna habitación se puede reservar en línea para esta búsqueda",
    "reservation.choose.reason.sold_out":
      "{rooms}: sin disponibilidad para estas fechas. Pruebe otras fechas.",
    "reservation.choose.reason.too_many_guests":
      "{rooms}: sin capacidad para su grupo. Cada reserva en línea es para una habitación: busque con menos huéspedes y reserve cada habitación por separado.",
    "reservation.choose.reason.offline":
      "{rooms}: sin reserva en línea. Escríbanos por WhatsApp para reservar.",
    "reservation.meta.reviewTitle": "Revise su reserva | Hotel Manantial",
    "reservation.meta.reviewDescription":
      "Revise su estadía, el precio y las condiciones, y añada los datos del contacto de la reserva.",
    "reservation.step.review": "Pago",
    "reservation.review.title": "Revise su reserva",
    "reservation.review.lead": "Revise su estadía y complete sus datos para pagar.",
    "reservation.review.unavailableLead": "Revise los detalles de su estadía a continuación.",
    "reservation.review.checkIn": "Llegada",
    "reservation.review.checkOut": "Salida",
    "reservation.review.dueNow": "A pagar ahora",
    "reservation.review.balance": "Saldo en el hotel",
    "reservation.review.whatsapp.title": "Continuemos por WhatsApp",
    "reservation.review.whatsapp.body":
      "El pago en línea está desactivado temporalmente. Envíenos los detalles de su estadía y le ayudaremos a reservar, sin completar un formulario aquí.",
    "reservation.review.whatsapp.button": "Continuar por WhatsApp",
    "reservation.review.whatsapp.newTab": "se abre en una pestaña nueva",
    "reservation.review.whatsapp.note":
      "Esta página no confirma una reserva. Confirme su reserva y coordine la forma de pago con el hotel por WhatsApp.",
    "reservation.review.whatsapp.message":
      "¡Hola! Quisiera reservar esta estadía.\nHabitación: {room}\nLlegada: {checkIn}\nSalida: {checkOut}\nHuéspedes: {guests}\nTarifa: {plan}\nTotal de la estadía: {total}\n¿Me confirman disponibilidad y forma de pago?",
    "reservation.review.loading": "Preparando su precio…",
    "reservation.review.loaded": "Su precio y sus condiciones están listos.",
    "reservation.review.stay": "Su estadía",
    "reservation.review.room": "Habitación",
    "reservation.review.dates": "Fechas",
    "reservation.review.guests": "Huéspedes",
    "reservation.review.plan": "Tarifa",
    "reservation.review.price": "Precio y condiciones",
    "reservation.review.contact": "Contacto de la reserva",
    "reservation.review.alternativeBooking": "¿Prefiere reservar por teléfono o WhatsApp?",
    "reservation.review.call": "Llámenos",
    "reservation.review.bookViaWhatsapp": "Reservar por WhatsApp",
    "reservation.review.contactLead":
      "Usaremos estos datos para gestionar su reserva y su pago, y para comunicarnos con usted sobre su estadía. {privacy}.",
    "reservation.review.privacyLink": "Información de privacidad",
    "reservation.review.conditionsLink": "Condiciones de reserva",
    "reservation.review.fullName": "Nombre completo",
    "reservation.review.email": "Correo electrónico",
    "reservation.review.phone": "Teléfono",
    "reservation.review.phoneCountry": "País y código: {name} ({code})",
    "reservation.review.phoneCountrySearch": "Buscar país",
    "reservation.review.phoneCountryEmpty": "No se encontraron países.",
    "reservation.review.cancellationEnded": "El plazo de cancelación gratuita terminó",
    "reservation.review.lateCancellationCharge":
      "Si cancela o no llega, se cobra la primera noche: {amount}.",
    "reservation.review.nonRefundableCancellation":
      "Si cancela o no llega, se cobra el total de la estadía: {amount}. Sin penalidad adicional.",
    "reservation.review.notes": "Notas (opcional)",
    "reservation.review.error.phoneTooShort":
      "El número es muy corto. Si es un teléfono fijo, incluya el código de área.",
    "reservation.review.error.phoneTooLong": "El número de teléfono es muy largo.",
    "reservation.review.error.phoneExtension": "Ingrese un teléfono sin extensión.",
    "reservation.review.error.notesTooLong": "Las notas no pueden superar los 2000 caracteres.",
    "reservation.review.terms": "Condiciones de la reserva",
    "reservation.review.termsLink": "condiciones de la reserva",
    "reservation.review.closeTerms": "Cerrar",
    "reservation.review.nightly": "Precio por noche",
    "reservation.review.schedule.flexible":
      "Pago: la primera noche, {now}, se paga en línea; el resto, {remaining}, se paga en el hotel.",
    "reservation.review.schedule.non_refundable":
      "Pago: toda la estadía, {now}, se paga en línea; no queda nada por pagar en el hotel.",
    "reservation.review.lifecycle":
      "Este precio se calculó al abrir esta página y se mantiene por unos minutos. Si hay que actualizarlo antes del pago, verá las nuevas condiciones antes de cualquier cobro. La habitación queda reservada solo cuando el pago se confirma y la reserva se guarda.",
    "reservation.review.agree":
      "Acepto las {terms}, incluidas las de cancelación y no presentación.",
    "reservation.review.saving": "Preparando su pago…",
    "reservation.review.payment": "Pago",
    "reservation.pay.provider": "El pago con tarjeta se procesa a través de Culqi.",
    "reservation.pay.security": "Verificación de seguridad antes del pago",
    "reservation.pay.button": "Pagar {amount}",
    "reservation.pay.busy": "Procesando…",
    "reservation.pay.sending": "Enviando su pago… Espere en esta página.",
    "reservation.pay.error.security":
      "Espere a que termine la verificación de seguridad de arriba y luego pague.",
    "reservation.pay.error.securityFailed":
      "La verificación de seguridad no se superó y no se cobró nada. Complete la verificación de nuevo y luego pague.",
    "reservation.pay.error.securityUnavailable":
      "La verificación de seguridad del pago no está disponible en este momento. No se cobró nada y sus datos se conservan: intente de nuevo en un momento o escríbanos por WhatsApp.",
    "reservation.pay.error.paused":
      "Los pagos en línea están en pausa en este momento. No se cobró nada y sus datos y las condiciones aceptadas se conservan en esta página. Intente más tarde o escríbanos por WhatsApp para reservar.",
    "reservation.pay.error.throttled":
      "Demasiados intentos de pago desde su conexión o para esta reserva. No se cobró nada y sus datos se conservan: espere un minuto e intente de nuevo.",
    "reservation.pay.changed":
      "El precio o las condiciones cambiaron, así que no se cobró nada. Revíselas y acéptelas de nuevo antes de pagar.",
    "reservation.pay.error.limited":
      "Esta revisión no puede registrar otro acuerdo, así que no se cobró nada. Sus datos siguen en esta página. Escríbanos por WhatsApp para reservar.",
    "reservation.pay.error.card":
      "No se pudo abrir el formulario de la tarjeta. No se cobró nada: revise su conexión e intente de nuevo.",
    "reservation.pay.error.unavailable":
      "No pudimos enviar su pago y no se cobró nada. Sus datos se conservan: intente de nuevo en un momento o escríbanos por WhatsApp.",
    "reservation.pay.error.retry":
      "El pago no se completó y no se cobró nada. Sus datos se conservan en esta página: vuelva a pagar.",
    "reservation.outcome.submitted.title": "Pago enviado, consultando su estado",
    "reservation.outcome.submitted.body":
      "Enviamos su pago pero no recibimos respuesta, así que su tarjeta podría haberse cobrado. No pague de nuevo: consulte su estado aquí o escríbanos por WhatsApp o por correo si necesita ayuda.",
    "reservation.outcome.reservation_changed.title": "El hotel actualizó su reserva",
    "reservation.outcome.reservation_changed.body":
      "Recibimos su pago y luego el hotel modificó esta reserva. Escríbanos por WhatsApp o por correo con su referencia para confirmar su estado actual.",
    "reservation.outcome.declined.title": "Su tarjeta fue rechazada",
    "reservation.outcome.declined.body":
      "No se cobró nada. Puede intentar el pago con otra tarjeta.",
    "reservation.outcome.authentication_required.title": "Su banco necesita verificar este pago",
    "reservation.outcome.authentication_required.body":
      "Para completar el pago, termine la verificación de su banco. Si cerró la ventana, puede abrirla de nuevo.",
    "reservation.outcome.authentication_required.eyebrow": "Verificación pendiente",
    "reservation.outcome.authentication_required.reassurance":
      "Continúe con la misma tarjeta. No vuelva a pagar.",
    "reservation.outcome.authentication_required.amount": "Pago pendiente",
    "reservation.outcome.declined.eyebrow": "Pago no completado",
    "reservation.outcome.declined.reassurance":
      "Sus datos y las condiciones aceptadas se conservan.",
    "reservation.outcome.declined.amount": "Monto por pagar",
    "reservation.outcome.authentication_expired.title": "La verificación del banco venció",
    "reservation.outcome.authentication_expired.body":
      "La verificación quedó sin terminar y este intento de pago se cerró. No se cobró nada.",
    "reservation.outcome.authentication_expired.eyebrow": "Verificación vencida",
    "reservation.outcome.authentication_expired.reassurance":
      "Sus datos se conservan. Revisaremos el precio antes de pagar.",
    "reservation.outcome.authentication_expired.amount": "Monto del intento anterior",
    "reservation.outcome.contactSaved": "Contacto guardado · condiciones aceptadas",
    "reservation.outcome.processing.title": "Confirmando su pago",
    "reservation.outcome.processing.body":
      "Estamos verificando su pago con el procesador de tarjetas. No pague de nuevo: la verificación continúa aunque cierre esta página.",
    "reservation.outcome.processing.delayed":
      "La verificación está tardando más de lo habitual. Continúa aunque cierre esta página, así que no pague de nuevo. Consulte el estado aquí más tarde o escríbanos por WhatsApp o por correo si necesita ayuda.",
    "reservation.outcome.paid_awaiting_reservation.title": "Pago recibido, guardando su reserva",
    "reservation.outcome.paid_awaiting_reservation.body":
      "Recibimos su pago y estamos guardando su reserva. No está confirmada hasta que se guarde, así que no pague de nuevo.",
    "reservation.outcome.unfulfilled.title": "Pago recibido, pero su reserva no se pudo confirmar",
    "reservation.outcome.unfulfilled.body":
      "Recibimos su pago, pero no se pudo reservar una habitación para estas fechas, así que no tiene una reserva. El monto por resolver todavía no se ha devuelto: escríbanos por WhatsApp o por correo con su referencia de atención y el hotel lo coordinará con usted.",
    "reservation.outcome.confirmed.title": "Su reserva está confirmada",
    "reservation.outcome.confirmed.body":
      "Guarde su referencia. El saldo pendiente, si lo hay, se paga en el hotel.",
    "reservation.outcome.reference": "Referencia",
    "reservation.outcome.supportReference": "Referencia de atención",
    "reservation.outcome.amount": "Monto del pago",
    "reservation.outcome.paid": "Pagado",
    "reservation.outcome.received": "Recibido",
    "reservation.outcome.outstanding": "Saldo pendiente",
    "reservation.outcome.awaiting": "Por resolver",
    "reservation.outcome.retry": "Pagar con otra tarjeta",
    "reservation.outcome.verifyBank": "Abrir la verificación del banco",
    "reservation.outcome.check": "Consultar estado",
    "reservation.outcome.checking": "Consultando su pago…",
    "reservation.meta.summaryTitle": "Resumen de la reserva | Hotel Manantial",
    "reservation.meta.summaryDescription":
      "Un resumen privado y limitado de una reserva. Quien tenga el enlace puede verlo.",
    "reservation.summary.title": "Resumen de la reserva",
    "reservation.summary.loading": "Abriendo el resumen de la reserva…",
    "reservation.summary.possession":
      "Quien tenga este enlace puede ver este resumen limitado. Compártalo solo con quienes deban ver la estadía.",
    "reservation.summary.copy": "Copiar enlace",
    "reservation.access.atHotel": "El saldo pendiente se paga en el hotel.",
    "reservation.access.loading": "Cargando el enlace de su reserva…",
    "reservation.access.unavailable.confirmed":
      "Su reserva está confirmada. No pudimos cargar el enlace; puede intentarlo de nuevo cuando quiera.",
    "reservation.access.unavailable.saved":
      "El resultado de esta reserva está guardado, pero no se pudo cargar su enlace. Inténtelo de nuevo o contacte al hotel con su referencia.",
    "reservation.access.retry": "Intentar de nuevo",
    "reservation.access.view": "Ver reserva",
    "reservation.confirmation.paymentLabel": "Pago y saldo",
    "reservation.confirmation.welcome": "Nos vemos en Churín.",
    "reservation.confirmation.accessTitle": "Su reserva, a mano",
    "reservation.confirmation.accessBody":
      "Guarde los detalles de su estadía y empiece a disfrutar de su viaje.",
    "reservation.confirmation.helpTitle": "Estamos para ayudarle",
    "reservation.confirmation.helpBody":
      "¿Tiene alguna pregunta o necesita un cambio? Con gusto le ayudamos.",
    "reservation.confirmation.call": "Llamar al hotel",
    "reservation.confirmation.whatsapp": "Escribir por WhatsApp",
    "reservation.confirmation.printLabel": "Confirmación para imprimir",
    "reservation.confirmation.printStatus": "Reserva confirmada",
    "reservation.confirmation.printTitle": "Confirmación de reserva",
    "reservation.confirmation.printWelcome": "Le esperamos en Churín.",
    "reservation.confirmation.duration": "Duración",
    "reservation.confirmation.payment": "Pago de su estadía",
    "reservation.confirmation.thanks": "Gracias por elegir Hotel Manantial.",
    "reservation.confirmation.printHelp":
      "Para consultas o cambios en su reserva, estamos para ayudarle.",
    "reservation.confirmation.preparing": "Preparando…",
    "reservation.confirmation.print": "Imprimir confirmación",

    "reservation.summary.copied": "Enlace copiado",
    "reservation.summary.staff":
      "Los cambios, las cancelaciones y los reembolsos se coordinan con el hotel. Esta página no puede modificar la reserva ni envía un correo.",
    "reservation.summary.unavailable.title": "No se pudo cargar el resumen de la reserva",
    "reservation.summary.unavailable.body":
      "No pudimos cargar su reserva en este momento. Inténtelo de nuevo o contacte al hotel para obtener ayuda.",
    "reservation.summary.unavailable.refresh":
      "No pudimos actualizar el resumen de su reserva. Inténtelo de nuevo para ver los datos actuales o contacte al hotel para obtener ayuda.",
    "reservation.summary.retry": "Intentar de nuevo",
    "reservation.summary.assistance.title": "El hotel puede ayudarle con esta reserva",
    "reservation.summary.assistance.body":
      "Este enlace no es válido o ya venció, así que no se muestran datos de la reserva. Llame, escriba o envíe un mensaje al hotel y el personal le ayudará.",
    "reservation.summary.phone": "Llamar al hotel",
    "reservation.summary.email": "Escribir al hotel",
    "reservation.summary.whatsapp": "WhatsApp",
    "reservation.summary.whatsappPrefill": "Hola, necesito ayuda con una reserva.",
    "reservation.summary.emailSubject": "Ayuda con una reserva",
    "reservation.summary.status": "Estado",
    "reservation.summary.status.confirmed": "Confirmada",
    "reservation.summary.status.checked_in": "Hospedado",
    "reservation.summary.status.checked_out": "Salida registrada",
    "reservation.summary.status.cancelled": "Cancelada",
    "reservation.summary.status.no_show": "No se presentó",
    "reservation.summary.status.unfulfilled": "Pago recibido, reserva no confirmada",
    "reservation.summary.contact": "Contacto de la reserva",
    "reservation.summary.nights": "Noches",
    "reservation.summary.total": "Total",
    "reservation.summary.refundDue": "Reembolso pendiente",
    "reservation.summary.refunded": "Reembolsado",
    "reservation.summary.roomUnknown": "Habitación",
    "reservation.summary.accepted.flexible":
      "Acuerdo aceptado: la cancelación gratuita era hasta el {date}. El cargo acordado después de esa fecha es {amount}.",
    "reservation.summary.accepted.none":
      "Acuerdo aceptado: sin cancelación gratuita. El cargo acordado es {amount}.",
    "reservation.summary.planUnknown": "Tarifa",
    "reservation.review.changed":
      "El precio o las condiciones de su estadía cambiaron. Revíselos y acepte de nuevo.",
    "reservation.review.error.fullName": "Ingrese el nombre completo del contacto.",
    "reservation.review.error.email": "Ingrese un correo válido, por ejemplo nombre@ejemplo.com.",
    "reservation.review.error.phone": "Ingrese un número de teléfono.",
    "reservation.review.error.phoneInvalid": "Este número no es válido para el país seleccionado.",
    "reservation.review.error.agree": "Marque la casilla para aceptar las condiciones.",
    "reservation.review.error.invalid":
      "No pudimos guardar estos datos. Revíselos e intente de nuevo.",
    "reservation.review.limited.title": "Esta revisión se modificó demasiadas veces",
    "reservation.review.limited.body":
      "Sus datos se conservan. Intente de nuevo para empezar una revisión nueva de la misma elección, o escríbanos por WhatsApp.",
    "reservation.review.error.throttled":
      "Demasiados intentos desde su conexión. Sus datos se conservan: espere un minuto e intente de nuevo.",
    "reservation.review.error.unavailable":
      "No pudimos guardar su aceptación en este momento. Sus datos se conservan: intente de nuevo.",
    "reservation.review.missing.title": "Primero elija habitación y tarifa",
    "reservation.review.missing.body":
      "No encontramos su elección. Vuelva y elija una habitación y una tarifa para sus fechas.",
    "reservation.review.soldOut.title": "Esta habitación ya no está disponible para estas fechas",
    "reservation.review.soldOut.body":
      "{room} ya no está disponible para estas fechas. Su búsqueda y sus datos se conservan. Vuelva para ver qué habitaciones siguen disponibles; no elegiremos otra por usted.",
    "reservation.review.throttled.title": "Demasiadas solicitudes de precio desde su conexión",
    "reservation.review.throttled.body":
      "Quienes comparten una conexión comparten este límite. Su elección y sus datos se conservan: espere un minuto e intente de nuevo, o escríbanos por WhatsApp.",
    "reservation.review.unavailable.title": "No pudimos preparar su precio en este momento",
    "reservation.review.unavailable.body":
      "Es un problema de nuestro sistema. Su elección y sus datos se conservan: intente de nuevo en un momento o escríbanos por WhatsApp.",
    "reservation.review.invalid.title": "Esta elección no se puede reservar en línea",
    "reservation.review.problem.tooManyGuests":
      "Esta habitación no admite a su grupo. Vuelva y elija otra habitación o cambie los huéspedes.",
  },
} as const;

type SameKeys<A, B> = [Exclude<keyof A, keyof B>, Exclude<keyof B, keyof A>] extends [never, never]
  ? true
  : false;

type Assert<T extends true> = T;
export type TranslationKeysMatch = Assert<SameKeys<typeof ui.en, typeof ui.es>>;
