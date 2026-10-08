SELECT kind,count(*) AS records,md5(string_agg(jsonb_build_array(kind,id,data,version,extract(epoch from updated_at))::text,E'\n' ORDER BY id COLLATE "C")) AS fingerprint,
(SELECT count(*) FROM public.crm_messages m LEFT JOIN public.crm_conversations c ON c.conversation_id=m.conversation_id WHERE c.conversation_id IS NULL) AS orphan_messages,
(SELECT count(*) FROM public.crm_conversations c LEFT JOIN public.crm_customers p ON p.customer_id=c.customer_id WHERE p.customer_id IS NULL) AS orphan_conversations
FROM public.chat_crm_records GROUP BY kind ORDER BY kind;
