import { i18n } from "astro:config/client";

export const defaultLang = i18n?.defaultLocale === "en" ? "en" : "es";

export const ui = {
  en: {
    "nav.home": "Home",
    "nav.rooms": "Rooms",
    "nav.churin": "Churín",
    "nav.book": "Book on WhatsApp",
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
      "Stay at Hotel Manantial in Churín, Peru, 5 minutes from the thermal baths of Mamahuarmi and La Juventud.",
    "meta.home.title": "Hotel in Churín with Parking, near the Hot Springs | Hotel Manantial",
    "meta.home.description":
      "Hotel in Churín, 5 min from the Mamahuarmi and La Juventud hot springs. Free parking, private bath, 24-h front desk. Check prices for your dates and book direct.",
    "meta.rooms.title": "Rooms & Rates in Churín | Hotel Manantial",
    "meta.rooms.description":
      'King room, premium double and family suite in Churín, priced per room with taxes included. 55" Smart TV, 24-h front desk, free parking. Check prices for your dates.',
    "meta.churin.title": "Churín Hot Springs Guide & How to Get There | Hotel Manantial",
    "meta.churin.description":
      "Guide to Mamahuarmi, La Juventud and Tingo, and how to reach Churín from Lima (≈ 4 h). Hotel Manantial: walk to the springs, 3 min to the plaza.",
    "meta.ogImageAlt": "Hotel Manantial, Churín, Peru. King room on a higher floor with a balcony.",
    "hero.eyebrow": "Churín, Peru · Priced per room, taxes included",
    "hero.title": "Hotel in Churín, 5 minutes from the hot springs",
    "hero.body":
      'Our hotel in Churín has a private bathroom, hot water and a 55" Smart TV in every room.',
    "hero.bookCta": "Check availability",
    "hero.roomsCta": "See rooms and rates",
    "hero.imageAlt": "Room at Hotel Manantial in Churín",
    "rooms.title": "A room for every kind of trip",
    "rooms.body":
      "The King room for couples, the Premium double for friends and the Family suite for families. Wi-Fi, an elevator, and rates per room, not per person.",
    "rooms.cta": "See all 3 rooms",
    "rooms.imageAlt": "King room at Hotel Manantial",
    "rooms.pageTitle": "Rooms in Churín",
    "rooms.pageBody":
      'Three room types, all with a private bathroom, hot water and a 55" 4K Smart TV. Priced per room, taxes included: check the price for your dates.',
    "rooms.intro.cta": "Check availability",
    "rooms.intro.direct": "Book direct and pay less than on booking sites: no commissions.",
    "rooms.king.name": "King room",
    "rooms.king.bestFor": "Best price",
    "rooms.king.lead":
      "For couples, or parents with a young child. One king bed in 194 sq ft. A few rooms on higher floors have a balcony at the same price: just ask when you book.",
    "rooms.king.cta": "Ask about the King room",
    "rooms.king.beds": "1 king bed",
    "rooms.photo.king": "King room with a smart TV and balcony at Hotel Manantial, Churín",
    "rooms.king.prefill":
      "Hello, I would like to check availability for a king room at Hotel Manantial. Dates: ___ Guests: ___",
    "rooms.double.name": "Premium double",
    "rooms.double.bestFor": "For friends",
    "rooms.double.lead": "Two full-size beds: share the room, not the bed. 215 sq ft.",
    "rooms.double.cta": "Ask about the Premium double",
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
    "rooms.double.prefill":
      "Hello, I would like to check availability for a premium double at Hotel Manantial. Dates: ___ Guests: ___",
    "rooms.family.name": "Family suite",
    "rooms.family.bestFor": "The most space",
    "rooms.family.lead":
      "A king plus a single bed, ideal for parents traveling with an older child. 237 sq ft, our largest room.",
    "rooms.family.cta": "Ask about the Family suite",
    "rooms.family.beds": "1 king bed and 1 twin",
    "rooms.photo.familyFront":
      "King bed and single bed in the family suite at Hotel Manantial, Churín",
    "rooms.photo.familySide":
      "Side view of the king bed and single bed in the family suite at Hotel Manantial, Churín",
    "rooms.photo.familyClose":
      "Close view of the two beds in the family suite at Hotel Manantial, Churín",
    "rooms.photo.kingBalcony":
      "King bed beside the balcony in the king room at Hotel Manantial, Churín",
    "rooms.family.prefill":
      "Hello, I would like to check availability for a family suite at Hotel Manantial. Dates: ___ Guests: ___",
    "rooms.spec.beds": "Beds",
    "rooms.spec.price": "Rate",
    "rooms.spec.area": "Room size",
    "rooms.gallery.open": "Open photo",
    "rooms.gallery.select": "Show photo",
    "rooms.gallery.of": "of",
    "rooms.gallery.previous": "Previous photo",
    "rooms.gallery.next": "Next photo",
    "rooms.gallery.close": "Close",
    "rooms.included.title": "In your room",
    "rooms.included.bathroom": "Private bathroom with hot water",
    "rooms.included.tv": '55" 4K Smart TV',
    "rooms.included.wifi": "Wi-Fi",
    "rooms.included.elevator": "Elevator",
    "rooms.included.desk": "24-hour front desk",
    "rooms.included.parking": "Free private parking",
    "rooms.hotel.title": "At the hotel",
    "rooms.hotel.pets": "Pets welcome, no restrictions (let us know when you book)",
    "rooms.how.kicker": "Book direct: a better rate, with no booking-site commission.",
    "rooms.how.title": "Book in 4 steps",
    "rooms.how.step1": "Message us on WhatsApp with your dates and number of guests.",
    "rooms.how.step2": "Tell us which room you'd like.",
    "rooms.how.step3": "We confirm availability and your final rate.",
    "rooms.how.step4": "Pay a one-night deposit and your room is held.",
    "rooms.rates.note":
      "Price per room per night, taxes included. Varies by date, not by number of guests.",
    "rooms.how.cta": "Message us on WhatsApp",
    "rooms.policies.title": "Before you book",
    "rooms.policies.checkIn": "Check-in",
    "rooms.policies.checkInValue": "From 2:00 p.m.",
    "rooms.policies.checkOut": "Check-out",
    "rooms.policies.checkOutValue": "Until 11:00 a.m.",
    "rooms.policies.payment": "Payment",
    "rooms.policies.paymentValue": "Cash, cards, Yape, or transfer",
    "rooms.policies.deposit": "Deposit",
    "rooms.policies.depositValue": "Flexible: first night. Non-refundable: full stay",
    "rooms.policies.breakfast": "Breakfast",
    "rooms.policies.breakfastValue": "Not included. Municipal market next door.",
    "rooms.policies.cancelTitle": "Cancellation",
    "rooms.policies.cancelBody":
      "Flexible rate: cancel free through two calendar days before arrival, Peru time. For a November 10 arrival, that is through November 8. After that, or if you don't arrive, the first night is charged. Non-refundable rate: 10% less, paid in full when you book; cancelling or not arriving is charged the full stay.",
    "rooms.policies.petsTitle": "Pets",
    "rooms.policies.petsBody": "Welcome. Let us know when you book.",
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
    "booking.title": "Book direct, no fees",
    "booking.body":
      "Send us your dates on WhatsApp and we'll confirm availability and your rate. Booking direct costs less than on booking sites.",
    "booking.cta": "Message us on WhatsApp",
    "whatsapp.prefill": "Hello, I would like to book. Dates: ___ Guests: ___ Room: ___",
    "notFound.metaTitle": "Page not found — Hotel Manantial",
    "notFound.metaDescription": "This page does not exist. Go back to Hotel Manantial.",
    "notFound.title": "The spring does not run through here",
    "notFound.body": "This address has no page. The hotel is still in the same place.",
    "notFound.homeCta": "Back to the hotel",
    "footer.contact": "Contact",
    "footer.whatsapp": "WhatsApp",
    "footer.email": "Email",
    "footer.whatsappLabel": "Message us on WhatsApp at {phone}",
    "footer.emailLabel": "Email {email}",
    "footer.addressLabel": "View {address} on Google Maps",
    "footer.socials": "Social",
    "footer.explore": "Explore",
    "footer.rights": "All rights reserved",
    "rooms.spec.priceValue": "Varies by date, taxes included",
    "reservation.cta": "See prices for your dates",
    "reservation.roomCta": "See prices and availability",
    "reservation.whatsappSecondary": "Or message us on WhatsApp",
    "reservation.meta.searchTitle": "Check availability | Hotel Manantial",
    "reservation.meta.searchDescription":
      "Choose your dates and guests to see live prices and availability at Hotel Manantial, Churín.",
    "reservation.meta.chooseTitle": "Choose your room and rate | Hotel Manantial",
    "reservation.meta.chooseDescription":
      "Compare the Flexible and Non-refundable rates for your dates at Hotel Manantial, Churín.",
    "reservation.steps": "Reservation steps",
    "reservation.step.search": "Dates and guests",
    "reservation.step.choose": "Room and rate",
    "reservation.search.title": "Check availability",
    "reservation.search.lead": "Choose your dates and guests to see today's prices for each room.",
    "reservation.search.checkIn": "Arrival",
    "reservation.search.checkOut": "Departure",
    "reservation.search.adults": "Adults",
    "reservation.search.children": "Children",
    "reservation.search.nightsEmpty": "Choose arrival and departure to see the number of nights.",
    "reservation.search.submit": "See rooms and prices",
    "reservation.search.limits":
      "Online reservations are for one room, start tomorrow at the earliest (Peru time) and last 1 to 60 nights.",
    "reservation.search.preference":
      "Preferred room: {room}. We'll show it first if it fits your search.",
    "reservation.search.clearPreference": "Show all rooms equally",
    "reservation.nights.one": "1 night",
    "reservation.nights.other": "{count} nights",
    "reservation.adults.one": "1 adult",
    "reservation.adults.other": "{count} adults",
    "reservation.children.one": "1 child",
    "reservation.children.other": "{count} children",
    "reservation.problem.checkInRequired": "Choose your arrival date.",
    "reservation.problem.checkOutRequired": "Choose your departure date.",
    "reservation.problem.checkInTooSoon":
      "Online reservations start tomorrow, Peru time. To arrive today, message us on WhatsApp.",
    "reservation.problem.checkOutBeforeCheckIn":
      "Departure must be at least one night after arrival.",
    "reservation.problem.tooManyNights": "Online stays can last up to 60 nights.",
    "reservation.problem.invalidDate": "One of the dates isn't valid.",
    "reservation.problem.invalidSearch":
      "We couldn't use this search. Please change it and try again.",
    "reservation.offline.title": "Online reservations aren't available yet",
    "reservation.offline.body":
      "Message us on WhatsApp with your dates and guests and we'll confirm availability and your rate.",
    "reservation.helpPrompt": "Questions? We're happy to help.",
    "reservation.choose.title": "Choose your room and rate",
    "reservation.choose.change": "Change search",
    "reservation.choose.loading": "Checking live availability…",
    "reservation.choose.loaded": "Showing rooms for your search.",
    "reservation.choose.missing.title": "Choose your dates first",
    "reservation.choose.missing.body":
      "Tell us when you're arriving and leaving to see rooms and prices.",
    "reservation.choose.missing.action": "Choose dates",
    "reservation.choose.unavailable.title": "We couldn't check availability right now",
    "reservation.choose.unavailable.body":
      "This is a problem on our side, not a lack of rooms. Your search is kept: try again in a moment, or message us on WhatsApp.",
    "reservation.choose.throttled.title": "Too many searches from your connection",
    "reservation.choose.throttled.body":
      "Everyone on a shared connection shares this limit. Your search is kept: wait a minute and try again, or message us on WhatsApp.",
    "reservation.choose.invalid.title": "Please change your search",
    "reservation.choose.retry": "Try again",
    "reservation.room.soldOut": "Sold out for these dates.",
    "reservation.room.tooManyGuests":
      "This room fits up to {adults} adults and {children} children.",
    "reservation.room.offline":
      "This room can't be reserved online. Message us on WhatsApp to book it.",
    "reservation.room.preferred": "Your preferred room",
    "reservation.room.preferredUnavailable":
      "Your preferred room, the {room}, isn't available for this search. We haven't chosen another room for you: pick one below or change your search.",
    "reservation.room.capacity": "Guests",
    "reservation.room.capacityValue": "Up to {adults} adults and {children} children",
    "reservation.plans.legend": "Rate for the {room}",
    "reservation.plan.flexible": "Flexible",
    "reservation.plan.flexibleLead": "Pay the first night now and the rest at the hotel.",
    "reservation.plan.non_refundable": "Non-refundable",
    "reservation.plan.non_refundableLead": "10% less. Pay the whole stay now.",
    "reservation.offer.total": "Stay total",
    "reservation.offer.now": "Pay now",
    "reservation.offer.remaining": "Pay at the hotel",
    "reservation.offer.saving": "You save {amount} compared with Flexible.",
    "reservation.offer.taxes": "Prices in {currency}, taxes included.",
    "reservation.cancel.available":
      "Free cancellation through {date}, inclusive (Peru time). After that, cancelling or not arriving costs the first night: {amount}.",
    "reservation.cancel.ended":
      "Free cancellation has already ended for these dates. Cancelling or not arriving costs the first night: {amount}.",
    "reservation.cancel.none":
      "No free cancellation. Cancelling or not arriving is charged the full stay, {amount}, with no other penalty.",
    "reservation.cancel.settlement":
      "Late-cancellation and no-show charges come out of what you paid. Any amount owed back to you is arranged with the hotel: a refund or, if you agree, credit for a future stay.",
    "reservation.choose.select": "Choose this room",
    "reservation.choice.title": "Your choice",
    "reservation.choice.summary": "{room} · {plan} rate",
    "reservation.choice.lost":
      "Your earlier choice, the {room}, isn't available for this search. Please choose again.",
    "reservation.choose.noOffers.title": "No room can be reserved online for this search",
    "reservation.choose.reason.sold_out": "{rooms}: sold out for these dates. Try other dates.",
    "reservation.choose.reason.too_many_guests":
      "{rooms}: not enough room for your group. Change the number of guests; online reservations are for one room.",
    "reservation.choose.reason.offline":
      "{rooms}: not bookable online. Message us on WhatsApp to book.",
    "reservation.choice.review": "Continue to review",
    "reservation.meta.reviewTitle": "Review your reservation | Hotel Manantial",
    "reservation.meta.reviewDescription":
      "Check your stay, price and terms, and add the booking contact's details.",
    "reservation.step.review": "Review and pay",
    "reservation.review.title": "Review your reservation",
    "reservation.review.loading": "Preparing your price…",
    "reservation.review.loaded": "Your price and terms are ready.",
    "reservation.review.stay": "Your stay",
    "reservation.review.room": "Room",
    "reservation.review.dates": "Dates",
    "reservation.review.guests": "Guests",
    "reservation.review.plan": "Rate",
    "reservation.review.changeChoice": "Change room or rate",
    "reservation.review.changeSearch": "Change dates or guests",
    "reservation.review.price": "Price and terms",
    "reservation.review.contact": "Booking contact",
    "reservation.review.contactLead":
      "The hotel uses these details to contact you about this reservation. No account is needed, and the contact doesn't have to be one of the guests.",
    "reservation.review.fullName": "Full name",
    "reservation.review.email": "Email",
    "reservation.review.phone": "Phone",
    "reservation.review.phoneHint": "Include the country code if it isn't a Peruvian number.",
    "reservation.review.terms": "Full reservation terms",
    "reservation.review.nightly": "Price per night",
    "reservation.review.schedule.flexible":
      "Payment: the first night, {now}, is paid online; the remaining {remaining} is paid at the hotel.",
    "reservation.review.schedule.non_refundable":
      "Payment: the whole stay, {now}, is paid online; nothing is left to pay at the hotel.",
    "reservation.review.lifecycle":
      "This price was calculated when you opened this page and is kept for a few minutes. If it needs updating before payment, you'll see the new terms before anything is charged. The room is reserved only once payment is confirmed and the reservation is saved.",
    "reservation.review.agree":
      "I accept the reservation terms on this page, including the cancellation and no-show conditions.",
    "reservation.review.submit": "Accept terms",
    "reservation.review.saving": "Saving your acceptance…",
    "reservation.review.payment": "Payment",
    "reservation.review.paymentUnavailable":
      "Online card payment isn't available yet, so nothing is charged on this page.",
    "reservation.review.accepted.title": "Terms accepted",
    "reservation.review.accepted.body":
      "Your acceptance of these terms is saved. Nothing has been charged yet.",
    "reservation.pay.lead":
      "Your room is reserved only once the card payment is confirmed and the reservation is saved.",
    "reservation.pay.security": "Security check before payment",
    "reservation.pay.button": "Pay {amount} by card",
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
    "reservation.outcome.submitted.title": "Payment sent, checking its status",
    "reservation.outcome.submitted.body":
      "We sent your payment but didn't receive an answer, so your card may have been charged. Please don't pay again: check its status here, or message us on WhatsApp or by email for help.",
    "reservation.outcome.reservation_changed.title": "Your reservation was updated by the hotel",
    "reservation.outcome.reservation_changed.body":
      "Your payment was received, and the hotel has since changed this reservation. Message us on WhatsApp or by email with your reference to confirm its current status.",
    "reservation.outcome.declined.title": "Your card was declined",
    "reservation.outcome.declined.body":
      "Nothing was charged. You can pay with another card; your details and accepted terms are kept.",
    "reservation.outcome.authentication_required.title": "Your bank needs to verify this payment",
    "reservation.outcome.authentication_required.body":
      "This payment is waiting for your bank's verification. It has not been declined, so please don't pay again. If the bank window closed before finishing, open it again. You can also check the status here, or message us on WhatsApp for help.",
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
    "reservation.review.changed":
      "The price or terms for your stay changed. Review them and accept again.",
    "reservation.review.error.fullName": "Enter the booking contact's full name.",
    "reservation.review.error.email": "Enter a valid email, like name@example.com.",
    "reservation.review.error.phone": "Enter a phone number.",
    "reservation.review.error.phoneInvalid":
      "This phone number isn't valid. Include the country code if it isn't Peruvian.",
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
    "reservation.review.backToRooms": "Back to rooms",
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
    "nav.home": "Inicio",
    "nav.rooms": "Habitaciones",
    "nav.churin": "Churín",
    "nav.book": "Reservar por WhatsApp",
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
      "Hospédese en Hotel Manantial en Churín, Perú, a 5 minutos de las aguas termales de Mamahuarmi y La Juventud.",
    "meta.home.title": "Hotel en Churín con cochera, cerca de las termas | Hotel Manantial",
    "meta.home.description":
      "Hotel en Churín a 5 min de las termas de Mamahuarmi y La Juventud. Cochera gratis, baño privado, recepción 24 h. Consulte el precio para sus fechas y reserve directo.",
    "meta.rooms.title": "Habitaciones en Churín | Hotel Manantial",
    "meta.rooms.description":
      'Suite matrimonial, doble premium y suite familiar en Churín, con precio por habitación e impuestos incluidos. Smart TV 55", recepción 24 h y cochera gratis.',
    "meta.churin.title": "Termas de Churín: guía y cómo llegar | Hotel Manantial",
    "meta.churin.description":
      "Guía de Mamahuarmi, La Juventud y Tingo y cómo llegar a Churín desde Lima (≈ 4 h). Hotel Manantial: termas a pie y la plaza a 3 min.",
    "meta.ogImageAlt":
      "Hotel Manantial, Churín, Perú. Suite Matrimonial con cama king, en un piso alto con balcón.",
    "hero.eyebrow": "Churín, Perú · Precio por habitación, impuestos incluidos",
    "hero.title": "Hotel en Churín a 5 minutos de las termas",
    "hero.body":
      'Nuestro hotel en Churín tiene baño privado, agua caliente y Smart TV de 55" en cada habitación.',
    "hero.bookCta": "Consultar disponibilidad",
    "hero.roomsCta": "Ver habitaciones y precios",
    "hero.imageAlt": "Habitación del Hotel Manantial en Churín",
    "rooms.title": "Una habitación para cada tipo de viaje",
    "rooms.body":
      "Suite Matrimonial para parejas, Doble Premium para amigos y Suite Familiar para familias. Wi-Fi, ascensor y precio por habitación, no por persona.",
    "rooms.cta": "Ver las 3 habitaciones",
    "rooms.imageAlt": "Suite matrimonial del Hotel Manantial",
    "rooms.pageTitle": "Habitaciones en Churín",
    "rooms.pageBody":
      'Tres tipos de habitación, todas con baño privado, agua caliente y Smart TV 55" 4K. Precio por habitación, impuestos incluidos: consulte el precio para sus fechas.',
    "rooms.intro.cta": "Consultar disponibilidad",
    "rooms.intro.direct":
      "Reservando directo paga menos que en las plataformas de reserva: sin comisiones.",
    "rooms.king.name": "Suite Matrimonial",
    "rooms.king.bestFor": "Mejor precio",
    "rooms.king.lead":
      "Para parejas, o para padres con un niño pequeño. Una cama king en 18 m². Algunas habitaciones en pisos altos tienen balcón, al mismo precio: pregúntenos al reservar.",
    "rooms.king.cta": "Consultar la Suite Matrimonial",
    "rooms.king.beds": "1 cama king",
    "rooms.photo.king": "Habitación con cama king, Smart TV y balcón en Hotel Manantial, Churín",
    "rooms.king.prefill":
      "Hola, quisiera consultar disponibilidad de una suite matrimonial en Hotel Manantial. Fechas: ___ Personas: ___",
    "rooms.double.name": "Doble Premium",
    "rooms.double.bestFor": "Para amigos",
    "rooms.double.lead":
      "Dos camas de 2 plazas para compartir habitación sin compartir cama. 20 m².",
    "rooms.double.cta": "Consultar la Doble Premium",
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
    "rooms.double.prefill":
      "Hola, quisiera consultar disponibilidad de una doble premium en Hotel Manantial. Fechas: ___ Personas: ___",
    "rooms.family.name": "Suite Familiar",
    "rooms.family.bestFor": "La más amplia",
    "rooms.family.lead":
      "Cama king más una individual: ideal para padres que viajan con un hijo mayor. 22 m², la habitación más amplia del hotel.",
    "rooms.family.cta": "Consultar la Suite Familiar",
    "rooms.family.beds": "1 cama king y 1 individual",
    "rooms.photo.familyFront":
      "Cama king y cama individual en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.familySide":
      "Vista lateral de la cama king y la cama individual en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.familyClose":
      "Vista cercana de las dos camas en la suite familiar del Hotel Manantial, Churín",
    "rooms.photo.kingBalcony":
      "Cama king junto al balcón en una habitación del Hotel Manantial, Churín",
    "rooms.family.prefill":
      "Hola, quisiera consultar disponibilidad de una suite familiar en Hotel Manantial. Fechas: ___ Personas: ___",
    "rooms.spec.beds": "Camas",
    "rooms.spec.price": "Tarifa",
    "rooms.spec.area": "Área",
    "rooms.gallery.open": "Abrir foto",
    "rooms.gallery.select": "Mostrar foto",
    "rooms.gallery.of": "de",
    "rooms.gallery.previous": "Foto anterior",
    "rooms.gallery.next": "Foto siguiente",
    "rooms.gallery.close": "Cerrar",
    "rooms.included.title": "En su habitación",
    "rooms.included.bathroom": "Baño privado con agua caliente",
    "rooms.included.tv": 'Smart TV 55" 4K',
    "rooms.included.wifi": "Wi-Fi",
    "rooms.included.elevator": "Ascensor",
    "rooms.included.desk": "Recepción 24 horas",
    "rooms.included.parking": "Cochera privada gratis",
    "rooms.hotel.title": "En el hotel",
    "rooms.hotel.pets": "Mascotas bienvenidas, sin restricciones (avísenos al reservar)",
    "rooms.how.kicker": "Reserva directa: mejor tarifa, sin comisiones de plataformas.",
    "rooms.how.title": "Reserve en 4 pasos",
    "rooms.how.step1": "Escríbanos por WhatsApp con sus fechas y número de huéspedes.",
    "rooms.how.step2": "Díganos qué habitación prefiere.",
    "rooms.how.step3": "Le confirmamos disponibilidad y tarifa final.",
    "rooms.how.step4": "Pague el adelanto de una noche y listo: su habitación queda asegurada.",
    "rooms.rates.note":
      "Precio por habitación y noche, impuestos incluidos. Varía según la fecha, no según el número de huéspedes.",
    "rooms.how.cta": "Escribir por WhatsApp",
    "rooms.policies.title": "Antes de reservar",
    "rooms.policies.checkIn": "Check-in",
    "rooms.policies.checkInValue": "Desde las 2:00 p. m.",
    "rooms.policies.checkOut": "Check-out",
    "rooms.policies.checkOutValue": "Hasta las 11:00 a. m.",
    "rooms.policies.payment": "Pago",
    "rooms.policies.paymentValue": "Efectivo, tarjetas, Yape o transferencia",
    "rooms.policies.deposit": "Adelanto",
    "rooms.policies.depositValue": "Flexible: primera noche. No reembolsable: toda la estadía",
    "rooms.policies.breakfast": "Desayuno",
    "rooms.policies.breakfastValue": "No incluido. Mercado municipal al lado.",
    "rooms.policies.cancelTitle": "Cancelación",
    "rooms.policies.cancelBody":
      "Tarifa Flexible: cancele gratis hasta dos días calendario antes de su llegada, hora de Perú. Para una llegada el 10 de noviembre, hasta el 8 de noviembre inclusive. Después, o si no llega, se cobra la primera noche. Tarifa No reembolsable: 10 % menos, se paga completa al reservar; si cancela o no llega, se cobra toda la estadía.",
    "rooms.policies.petsTitle": "Mascotas",
    "rooms.policies.petsBody": "Bienvenidas. Avísenos al reservar.",
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
    "booking.title": "Reserve directo y sin comisiones",
    "booking.body":
      "Envíenos sus fechas por WhatsApp y le confirmamos disponibilidad y tarifa. Reservar directo cuesta menos que en las plataformas.",
    "booking.cta": "Escribir por WhatsApp",
    "whatsapp.prefill": "Hola, quisiera reservar. Fechas: ___ Personas: ___ Habitación: ___",
    "notFound.metaTitle": "Página no encontrada — Hotel Manantial",
    "notFound.metaDescription": "Esta página no existe. Vuelva al inicio de Hotel Manantial.",
    "notFound.title": "El manantial no pasa por aquí",
    "notFound.body": "Esta dirección no tiene página. El hotel sigue en el mismo sitio.",
    "notFound.homeCta": "Volver al hotel",
    "footer.contact": "Contacto",
    "footer.whatsapp": "WhatsApp",
    "footer.email": "Correo",
    "footer.whatsappLabel": "Escribir por WhatsApp al {phone}",
    "footer.emailLabel": "Enviar un correo a {email}",
    "footer.addressLabel": "Ver {address} en Google Maps",
    "footer.socials": "Redes",
    "footer.explore": "Explorar",
    "footer.rights": "Todos los derechos reservados",
    "rooms.spec.priceValue": "Varía según la fecha, impuestos incluidos",
    "reservation.cta": "Ver precios para sus fechas",
    "reservation.roomCta": "Ver precios y disponibilidad",
    "reservation.whatsappSecondary": "O escríbanos por WhatsApp",
    "reservation.meta.searchTitle": "Consultar disponibilidad | Hotel Manantial",
    "reservation.meta.searchDescription":
      "Elija sus fechas y huéspedes para ver precios y disponibilidad en Hotel Manantial, Churín.",
    "reservation.meta.chooseTitle": "Elija habitación y tarifa | Hotel Manantial",
    "reservation.meta.chooseDescription":
      "Compare las tarifas Flexible y No reembolsable para sus fechas en Hotel Manantial, Churín.",
    "reservation.steps": "Pasos de la reserva",
    "reservation.step.search": "Fechas y huéspedes",
    "reservation.step.choose": "Habitación y tarifa",
    "reservation.search.title": "Consulte disponibilidad",
    "reservation.search.lead":
      "Elija sus fechas y huéspedes para ver el precio de hoy de cada habitación.",
    "reservation.search.checkIn": "Llegada",
    "reservation.search.checkOut": "Salida",
    "reservation.search.adults": "Adultos",
    "reservation.search.children": "Niños",
    "reservation.search.nightsEmpty": "Elija llegada y salida para ver el número de noches.",
    "reservation.search.submit": "Ver habitaciones y precios",
    "reservation.search.limits":
      "Las reservas en línea son para una habitación, empiezan desde mañana (hora de Perú) y duran de 1 a 60 noches.",
    "reservation.search.preference":
      "Habitación preferida: {room}. La mostraremos primero si se ajusta a su búsqueda.",
    "reservation.search.clearPreference": "Mostrar todas por igual",
    "reservation.nights.one": "1 noche",
    "reservation.nights.other": "{count} noches",
    "reservation.adults.one": "1 adulto",
    "reservation.adults.other": "{count} adultos",
    "reservation.children.one": "1 niño",
    "reservation.children.other": "{count} niños",
    "reservation.problem.checkInRequired": "Elija su fecha de llegada.",
    "reservation.problem.checkOutRequired": "Elija su fecha de salida.",
    "reservation.problem.checkInTooSoon":
      "Las reservas en línea empiezan desde mañana, hora de Perú. Para llegar hoy, escríbanos por WhatsApp.",
    "reservation.problem.checkOutBeforeCheckIn":
      "La salida debe ser al menos una noche después de la llegada.",
    "reservation.problem.tooManyNights": "Las estadías en línea pueden durar hasta 60 noches.",
    "reservation.problem.invalidDate": "Una de las fechas no es válida.",
    "reservation.problem.invalidSearch":
      "No pudimos usar esta búsqueda. Cámbiela e intente de nuevo.",
    "reservation.offline.title": "La reserva en línea aún no está disponible",
    "reservation.offline.body":
      "Escríbanos por WhatsApp con sus fechas y huéspedes y le confirmamos disponibilidad y tarifa.",
    "reservation.helpPrompt": "¿Dudas? Con gusto le ayudamos.",
    "reservation.choose.title": "Elija habitación y tarifa",
    "reservation.choose.change": "Cambiar búsqueda",
    "reservation.choose.loading": "Consultando disponibilidad…",
    "reservation.choose.loaded": "Mostrando habitaciones para su búsqueda.",
    "reservation.choose.missing.title": "Primero elija sus fechas",
    "reservation.choose.missing.body":
      "Indíquenos cuándo llega y cuándo se va para ver habitaciones y precios.",
    "reservation.choose.missing.action": "Elegir fechas",
    "reservation.choose.unavailable.title":
      "No pudimos consultar la disponibilidad en este momento",
    "reservation.choose.unavailable.body":
      "Es un problema de nuestro sistema, no falta de habitaciones. Su búsqueda se conserva: intente de nuevo en un momento o escríbanos por WhatsApp.",
    "reservation.choose.throttled.title": "Demasiadas búsquedas desde su conexión",
    "reservation.choose.throttled.body":
      "Quienes comparten una conexión comparten este límite. Su búsqueda se conserva: espere un minuto e intente de nuevo, o escríbanos por WhatsApp.",
    "reservation.choose.invalid.title": "Revise su búsqueda",
    "reservation.choose.retry": "Intentar de nuevo",
    "reservation.room.soldOut": "Agotada para estas fechas.",
    "reservation.room.tooManyGuests":
      "Esta habitación admite hasta {adults} adultos y {children} niños.",
    "reservation.room.offline":
      "Esta habitación no se puede reservar en línea. Escríbanos por WhatsApp para reservarla.",
    "reservation.room.preferred": "Su habitación preferida",
    "reservation.room.preferredUnavailable":
      "Su habitación preferida, {room}, no está disponible para esta búsqueda. No elegimos otra por usted: elija una abajo o cambie su búsqueda.",
    "reservation.room.capacity": "Huéspedes",
    "reservation.room.capacityValue": "Hasta {adults} adultos y {children} niños",
    "reservation.plans.legend": "Tarifa para {room}",
    "reservation.plan.flexible": "Flexible",
    "reservation.plan.flexibleLead": "Pague la primera noche ahora y el resto en el hotel.",
    "reservation.plan.non_refundable": "No reembolsable",
    "reservation.plan.non_refundableLead": "10 % menos. Pague toda la estadía ahora.",
    "reservation.offer.total": "Total de la estadía",
    "reservation.offer.now": "Pago ahora",
    "reservation.offer.remaining": "Pago en el hotel",
    "reservation.offer.saving": "Ahorra {amount} frente a la tarifa Flexible.",
    "reservation.offer.taxes": "Precios en {currency}, impuestos incluidos.",
    "reservation.cancel.available":
      "Cancelación gratuita hasta el {date} inclusive (hora de Perú). Después, si cancela o no llega, se cobra la primera noche: {amount}.",
    "reservation.cancel.ended":
      "Para estas fechas ya no hay cancelación gratuita. Si cancela o no llega, se cobra la primera noche: {amount}.",
    "reservation.cancel.none":
      "Sin cancelación gratuita. Si cancela o no llega, se cobra toda la estadía, {amount}, sin otra penalidad.",
    "reservation.cancel.settlement":
      "Los cargos por cancelación tardía o por no llegar se descuentan de lo pagado. Cualquier saldo a su favor se coordina con el hotel: un reembolso o, si usted acepta, un crédito para una estadía futura.",
    "reservation.choose.select": "Elegir esta habitación",
    "reservation.choice.title": "Su elección",
    "reservation.choice.summary": "{room} · tarifa {plan}",
    "reservation.choice.lost":
      "Su elección anterior, {room}, no está disponible para esta búsqueda. Elija de nuevo.",
    "reservation.choose.noOffers.title":
      "Ninguna habitación se puede reservar en línea para esta búsqueda",
    "reservation.choose.reason.sold_out":
      "{rooms}: sin disponibilidad para estas fechas. Pruebe otras fechas.",
    "reservation.choose.reason.too_many_guests":
      "{rooms}: sin capacidad para su grupo. Cambie el número de huéspedes; las reservas en línea son para una habitación.",
    "reservation.choose.reason.offline":
      "{rooms}: sin reserva en línea. Escríbanos por WhatsApp para reservar.",
    "reservation.choice.review": "Continuar a la revisión",
    "reservation.meta.reviewTitle": "Revise su reserva | Hotel Manantial",
    "reservation.meta.reviewDescription":
      "Revise su estadía, el precio y las condiciones, y añada los datos del contacto de la reserva.",
    "reservation.step.review": "Revisar y pagar",
    "reservation.review.title": "Revise su reserva",
    "reservation.review.loading": "Preparando su precio…",
    "reservation.review.loaded": "Su precio y sus condiciones están listos.",
    "reservation.review.stay": "Su estadía",
    "reservation.review.room": "Habitación",
    "reservation.review.dates": "Fechas",
    "reservation.review.guests": "Huéspedes",
    "reservation.review.plan": "Tarifa",
    "reservation.review.changeChoice": "Cambiar habitación o tarifa",
    "reservation.review.changeSearch": "Cambiar fechas o huéspedes",
    "reservation.review.price": "Precio y condiciones",
    "reservation.review.contact": "Contacto de la reserva",
    "reservation.review.contactLead":
      "El hotel usa estos datos para comunicarse con usted sobre esta reserva. No necesita una cuenta, y el contacto no tiene que ser uno de los huéspedes.",
    "reservation.review.fullName": "Nombre completo",
    "reservation.review.email": "Correo electrónico",
    "reservation.review.phone": "Teléfono",
    "reservation.review.phoneHint": "Incluya el código de país si no es un número peruano.",
    "reservation.review.terms": "Condiciones completas de la reserva",
    "reservation.review.nightly": "Precio por noche",
    "reservation.review.schedule.flexible":
      "Pago: la primera noche, {now}, se paga en línea; el resto, {remaining}, se paga en el hotel.",
    "reservation.review.schedule.non_refundable":
      "Pago: toda la estadía, {now}, se paga en línea; no queda nada por pagar en el hotel.",
    "reservation.review.lifecycle":
      "Este precio se calculó al abrir esta página y se mantiene por unos minutos. Si hay que actualizarlo antes del pago, verá las nuevas condiciones antes de cualquier cobro. La habitación queda reservada solo cuando el pago se confirma y la reserva se guarda.",
    "reservation.review.agree":
      "Acepto las condiciones de la reserva de esta página, incluidas las de cancelación y no presentación.",
    "reservation.review.submit": "Aceptar condiciones",
    "reservation.review.saving": "Guardando su aceptación…",
    "reservation.review.payment": "Pago",
    "reservation.review.paymentUnavailable":
      "El pago con tarjeta en línea aún no está disponible, así que en esta página no se cobra nada.",
    "reservation.review.accepted.title": "Condiciones aceptadas",
    "reservation.review.accepted.body":
      "Su aceptación de estas condiciones quedó guardada. Todavía no se ha cobrado nada.",
    "reservation.pay.lead":
      "Su habitación queda reservada solo cuando el pago con tarjeta se confirma y la reserva se guarda.",
    "reservation.pay.security": "Verificación de seguridad antes del pago",
    "reservation.pay.button": "Pagar {amount} con tarjeta",
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
    "reservation.outcome.submitted.title": "Pago enviado, consultando su estado",
    "reservation.outcome.submitted.body":
      "Enviamos su pago pero no recibimos respuesta, así que su tarjeta podría haberse cobrado. No pague de nuevo: consulte su estado aquí o escríbanos por WhatsApp o por correo si necesita ayuda.",
    "reservation.outcome.reservation_changed.title": "El hotel actualizó su reserva",
    "reservation.outcome.reservation_changed.body":
      "Recibimos su pago y luego el hotel modificó esta reserva. Escríbanos por WhatsApp o por correo con su referencia para confirmar su estado actual.",
    "reservation.outcome.declined.title": "Su tarjeta fue rechazada",
    "reservation.outcome.declined.body":
      "No se cobró nada. Puede pagar con otra tarjeta; sus datos y las condiciones aceptadas se conservan.",
    "reservation.outcome.authentication_required.title": "Su banco necesita verificar este pago",
    "reservation.outcome.authentication_required.body":
      "Este pago espera la verificación de su banco. No fue rechazado, así que no pague de nuevo. Si la ventana del banco se cerró antes de terminar, ábrala de nuevo. También puede consultar el estado aquí o escribirnos por WhatsApp si necesita ayuda.",
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
    "reservation.review.changed":
      "El precio o las condiciones de su estadía cambiaron. Revíselos y acepte de nuevo.",
    "reservation.review.error.fullName": "Ingrese el nombre completo del contacto.",
    "reservation.review.error.email": "Ingrese un correo válido, por ejemplo nombre@ejemplo.com.",
    "reservation.review.error.phone": "Ingrese un número de teléfono.",
    "reservation.review.error.phoneInvalid":
      "Este número de teléfono no es válido. Incluya el código de país si no es peruano.",
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
    "reservation.review.backToRooms": "Volver a las habitaciones",
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
