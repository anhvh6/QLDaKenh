-- QL Da nen tang: scoped server reads and explicitly confirmed purge.
-- No customer data is deleted when installing these functions/policies.
GRANT SELECT ON public.chat_crm_records TO authenticated;
CREATE POLICY chatbot_history_admin_read ON public.chat_crm_records FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id=(SELECT auth.uid()) AND a.role='super_admin'));
CREATE OR REPLACE FUNCTION public.purge_customer_data(
 p_customer_ids text[], p_learner_keys text[], p_conversation_ids text[], p_confirm boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids text[]; n integer; removed integer:=0; pass integer; before_count integer; contacts uuid[]; convs uuid[]; msgs uuid[]; jobs uuid[]; runs uuid[];
BEGIN
 IF NOT coalesce(p_confirm,false) OR auth.uid() IS NULL OR NOT EXISTS
  (SELECT 1 FROM public.admin_users a WHERE a.id=auth.uid() AND a.role='super_admin')
 THEN RAISE EXCEPTION 'Explicit confirmation and super_admin required'; END IF;
 IF coalesce(cardinality(p_customer_ids),0)>100 OR coalesce(cardinality(p_learner_keys),0)>100
 OR coalesce(cardinality(p_conversation_ids),0)>500 OR coalesce(cardinality(p_customer_ids),0)=0
 THEN RAISE EXCEPTION 'Invalid purge scope'; END IF;
 ids:=coalesce(p_customer_ids,'{}')||coalesce(p_conversation_ids,'{}');
 FOR pass IN 1..50 LOOP
  before_count:=cardinality(ids);
  SELECT array_agg(DISTINCT id) INTO ids FROM (
   SELECT unnest(ids) id UNION ALL
   SELECT r.id FROM (SELECT * FROM public.records UNION ALL SELECT * FROM public.chat_crm_records) r
    WHERE r.kind NOT IN ('settings','connections','templates','assets','products','chatbots','chatbot_routes','ai_connections','customer_purge_jobs','chat_purge_tombstones') AND ((r.kind='customers' AND r.id=ANY(p_customer_ids))
    OR EXISTS (SELECT 1 FROM jsonb_each_text(r.data) e WHERE e.key=ANY(ARRAY['customerId','conversationId','orderId','handoffId','planId','messageId','jobId','runId','shipmentId','taskId','botRunId']) AND e.value=ANY(ids)))
  ) matched;
  IF cardinality(ids)>50000 THEN RAISE EXCEPTION 'Purge scope too large'; END IF;
  EXIT WHEN before_count=cardinality(ids);
  IF pass=50 THEN RAISE EXCEPTION 'Too many dependency levels'; END IF;
 END LOOP;
 IF cardinality(ids)>50000 THEN RAISE EXCEPTION 'Purge scope too large'; END IF;
 -- Remove private conversation uploads; retain shared library/template media without the deleted chat association.
 DELETE FROM public.chat_crm_records a WHERE a.kind='assets' AND a.data->>'conversationId'=ANY(ids) AND NOT EXISTS
 (SELECT 1 FROM (SELECT * FROM public.records UNION ALL SELECT * FROM public.chat_crm_records) r WHERE r.id<>a.id AND NOT r.id=ANY(ids) AND (position(a.id in r.data::text)>0 OR coalesce(a.data->>'url','')<>'' AND position(a.data->>'url' in r.data::text)>0));
 DELETE FROM public.records a WHERE a.kind='assets' AND a.data->>'conversationId'=ANY(ids) AND NOT EXISTS
 (SELECT 1 FROM (SELECT * FROM public.records UNION ALL SELECT * FROM public.chat_crm_records) r WHERE r.id<>a.id AND NOT r.id=ANY(ids) AND (position(a.id in r.data::text)>0 OR coalesce(a.data->>'url','')<>'' AND position(a.data->>'url' in r.data::text)>0));
 UPDATE public.chat_crm_records SET data=data-'conversationId',version=version+1,updated_at=now() WHERE kind='assets' AND data->>'conversationId'=ANY(ids);
 UPDATE public.records SET data=data-'conversationId',version=version+1,updated_at=now() WHERE kind='assets' AND data->>'conversationId'=ANY(ids);
 DELETE FROM public.chat_crm_records r WHERE r.id=ANY(ids) AND r.kind NOT IN ('settings','connections','templates','assets','products','chatbots','chatbot_routes','ai_connections','customer_purge_jobs','chat_purge_tombstones');
 GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 DELETE FROM public.records r WHERE r.id=ANY(ids) AND r.kind NOT IN ('settings','connections','templates','assets','products','chatbots','chatbot_routes','ai_connections','customer_purge_jobs','chat_purge_tombstones');
 GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 SELECT array_agg(id) INTO contacts FROM public.mc_contacts WHERE local_id=ANY(p_customer_ids) OR phacdo_customer_id IN (SELECT id FROM public.customers WHERE customer_id=ANY(p_learner_keys));
 SELECT array_agg(id) INTO convs FROM public.mc_conversations WHERE local_id=ANY(p_conversation_ids) OR contact_id=ANY(contacts);
 SELECT array_agg(id) INTO msgs FROM public.mc_messages WHERE conversation_id=ANY(convs);
 SELECT array_agg(id) INTO jobs FROM public.mc_chatbot_jobs WHERE conversation_id=ANY(convs);
 SELECT array_agg(id) INTO runs FROM public.mc_chatbot_runs WHERE conversation_id=ANY(convs);
 DELETE FROM public.mc_message_outbox WHERE conversation_id=ANY(convs) OR run_id=ANY(runs);
 DELETE FROM public.mc_staff_notifications WHERE handoff_id IN (SELECT id FROM public.mc_staff_handoffs WHERE conversation_id=ANY(convs) OR contact_id=ANY(contacts));
 DELETE FROM public.mc_staff_handoffs WHERE conversation_id=ANY(convs) OR contact_id=ANY(contacts);
 DELETE FROM public.mc_chatbot_runs WHERE id=ANY(runs);
 DELETE FROM public.mc_chatbot_job_messages WHERE job_id=ANY(jobs) OR message_id=ANY(msgs);
 DELETE FROM public.mc_chatbot_jobs WHERE id=ANY(jobs);
 DELETE FROM public.mc_chatbot_receipts WHERE message_id=ANY(msgs);
 DELETE FROM public.mc_message_media WHERE message_id=ANY(msgs);
 DELETE FROM public.mc_media_usage_events WHERE message_id=ANY(msgs);
 DELETE FROM public.mc_messages WHERE id=ANY(msgs);
 DELETE FROM public.mc_conversation_ai_settings WHERE conversation_id=ANY(convs);
 DELETE FROM public.mc_conversations WHERE id=ANY(convs);
 DELETE FROM public.mc_progress_history WHERE contact_id=ANY(contacts);
 DELETE FROM public.mc_identities WHERE contact_id=ANY(contacts);
 DELETE FROM public.mc_contacts WHERE id=ANY(contacts);
 -- Dependent attendance/devices/tasks use existing ON DELETE CASCADE.
 DELETE FROM public.video_view_logs v WHERE v.task_id IN
  (SELECT t.id::text FROM public.customer_tasks t WHERE t.customer_id=ANY(p_learner_keys));
 DELETE FROM public.payment_orders WHERE customer_id=ANY(p_learner_keys);
 DELETE FROM public.customers WHERE customer_id=ANY(p_learner_keys);
 GET DIAGNOSTICS n=ROW_COUNT;removed:=removed+n;
 RETURN jsonb_build_object('ok',true,'removed',removed);
END;$$;
REVOKE ALL ON FUNCTION public.purge_customer_data(text[],text[],text[],boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purge_customer_data(text[],text[],text[],boolean) TO authenticated;
