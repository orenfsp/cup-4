from appeals import analytics
from appeals import views as appeals
from appeals.stream import stream
from django.urls import path
from health.views import health, ready
from routing import administration
from routing import views as routing
from staff import views as staff

urlpatterns = [
    path("api/applicant/appeals/<uuid:appeal_id>/stream/", stream, name="applicant-stream"),
    path("api/staff/appeals/<uuid:appeal_id>/stream/", stream, name="staff-stream"),
    path("api/staff/configuration/", administration.configuration, name="configuration"),
    path("api/staff/configuration/actions/", administration.update, name="configuration-update"),
    path("api/staff/analytics/", analytics.report, name="analytics"),
    path("api/staff/analytics/export/", analytics.export, name="analytics-export"),
    path("api/staff/routing-alerts/", routing.alerts, name="routing-alerts"),
    path("api/catalog/", routing.catalog, name="catalog"),
    path("api/crisis/contacts/", appeals.crisis_contacts, name="crisis-contacts"),
    path("api/staff/appeals/<uuid:appeal_id>/routing/", routing.routing, name="routing"),
    path(
        "api/staff/appeals/<uuid:appeal_id>/messages/",
        appeals.staff_messages,
        name="staff-messages",
    ),
    path("api/applicant/current/", appeals.current_appeal, name="applicant-current"),
    path(
        "api/applicant/appeals/<uuid:appeal_id>/messages/",
        appeals.applicant_messages,
        name="applicant-messages",
    ),
    path(
        "api/applicant/appeals/<uuid:appeal_id>/actions/",
        appeals.applicant_action,
        name="applicant-action",
    ),
    path("api/health/", health, name="health"),
    path("api/ready/", ready, name="ready"),
    path("api/csrf/", staff.csrf, name="csrf"),
    path("api/staff/login/", staff.login, name="staff-login"),
    path("api/staff/logout/", staff.logout, name="staff-logout"),
    path("api/staff/me/", staff.me, name="staff-me"),
    path("api/staff/appeals/", appeals.staff_list, name="staff-appeals"),
    path("api/staff/appeals/<uuid:appeal_id>/", appeals.staff_detail, name="staff-appeal"),
    path("api/staff/appeals/<uuid:appeal_id>/actions/", appeals.staff_action, name="staff-action"),
    path("api/staff/appeals/<uuid:appeal_id>/events/", appeals.staff_events, name="staff-events"),
    path(
        "api/staff/appeals/<uuid:appeal_id>/collaboration/",
        appeals.collaboration,
        name="collaboration",
    ),
    path(
        "api/staff/appeals/<uuid:appeal_id>/crisis-contact/",
        appeals.crisis_contact,
        name="crisis-contact",
    ),
    path("api/applicant/appeals/", appeals.create, name="appeal-create"),
    path("api/applicant/session/", appeals.exchange, name="appeal-exchange"),
    path("api/applicant/logout/", appeals.applicant_logout, name="appeal-logout"),
    path(
        "api/applicant/appeals/<uuid:appeal_id>/", appeals.applicant_detail, name="applicant-appeal"
    ),
    path(
        "api/applicant/attachments/<uuid:attachment_id>/",
        appeals.attachment_download,
        name="applicant-attachment",
    ),
    path(
        "api/staff/attachments/<uuid:attachment_id>/",
        appeals.attachment_download,
        name="staff-attachment",
    ),
]

handler400 = "infrastructure.http.bad_request"
