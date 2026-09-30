-- 20260930000014_phase5_mobile_team_workspace.sql
-- Photography Pixel — Phase 5A: Mobile Team Workspace (Coordinator app).
--
-- The mobile app creates a multi-video delivery with ONLY the client name:
-- WhatsApp is not required and no fake phone number is ever invented, so the
-- delivery stays client-less (deliveries.client_id = NULL) and the name the
-- coordinator typed is stored in the new nullable deliveries.client_label.
-- A delivery renders clients.name when a real client is attached and falls
-- back to client_label otherwise.
--
-- Additive only: no existing row is inserted, updated or deleted, and no
-- constraint on clients (whatsapp_number NOT NULL UNIQUE) is touched.

begin;

alter table public.deliveries
    add column if not exists client_label text;

alter table public.deliveries
    add constraint deliveries_client_label_len_check
    check (client_label is null or char_length(client_label) <= 80);

comment on column public.deliveries.client_label is
    'اسم العميل كما كتبه المنسق عند إنشاء رابط من مساحة الفريق على الجوال (واتساب غير مطلوب). يُعرض فقط عندما لا يوجد عميل مرتبط بالتوصيل.';

commit;
