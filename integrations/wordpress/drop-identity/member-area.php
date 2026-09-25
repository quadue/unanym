<?php
// A deliberately small receiving-site policy: one native private WordPress page.
if (!defined('ABSPATH')) exit;
function unanym_member_area() { return get_option('unanym_member_area',[]); }
function unanym_member_area_url() {
    $area=unanym_member_area();$page=get_post((int)($area['page']??0));
    return $page && $page->post_type==='page' && $page->post_status==='private' ? get_permalink($page) : '';
}
function unanym_member_area_settings() {
    if ((drop_identity_config()['contract']??'')!=='community-v1') return;
    $area=unanym_member_area();
    echo '<h2>3. Choose a member area</h2><p>Create a WordPress page with visibility set to Private, then choose it here. Its text and page content stay private even if this integration is disabled. Uploaded files need separate protection.</p><form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
    wp_nonce_field('unanym_member_area');echo '<input type="hidden" name="action" value="unanym_member_area"><table class="form-table">';
    echo '<tr><th><label for="unanym-member-page">Members-only page</label></th><td><select id="unanym-member-page" name="page"><option value="0">No member area</option>';
    foreach (get_posts(['post_type'=>'page','post_status'=>'private','numberposts'=>-1,'orderby'=>'title','order'=>'ASC']) as $p) echo '<option value="'.(int)$p->ID.'" '.selected((int)($area['page']??0),$p->ID,false).'>'.esc_html($p->post_title).'</option>';
    echo '</select></td></tr><tr><th><label for="unanym-member-organisation">Required organisation membership</label></th><td><select id="unanym-member-organisation" name="organisation"><option value="">Choose an organisation</option>';
    foreach (drop_identity_config()['organisations']??[] as $org) echo '<option value="'.esc_attr($org).'" '.selected($area['organisation']??'',$org,false).'>'.esc_html($org).'</option>';
    echo '</select></td></tr></table>';submit_button('Save member area');echo '</form>';
    if ($url=unanym_member_area_url()) echo '<p><a href="'.esc_url($url).'">Open member area</a></p>';
}
add_action('admin_post_unanym_member_area',function(){
    if (!current_user_can('manage_options')) drop_identity_error('Administrator access required.');
    check_admin_referer('unanym_member_area');
    $id=absint($_POST['page']??0);$org=sanitize_text_field(wp_unslash($_POST['organisation']??''));
    if ($id) {
        $p=get_post($id);
        if ((drop_identity_config()['contract']??'')!=='community-v1' || !$p || $p->post_type!=='page' || $p->post_status!=='private'
            || !in_array($org,drop_identity_config()['organisations']??[],true)) drop_identity_error('Choose a private page and a recognised organisation.');
        update_option('unanym_member_area',['page'=>$id,'organisation'=>$org],false);
    } else delete_option('unanym_member_area');
    wp_safe_redirect(admin_url('options-general.php?page=drop-identity'));exit;
});
// Never hand out read_private_pages or a persistent role: the current request's
// verified statement authorises just this object, for the current signed-in user.
add_filter('map_meta_cap',function($caps,$cap,$uid,$args){
    $area=unanym_member_area();$id=(int)($args[0]??0);
    if ($cap!=='read_post' || !$id || $id!==(int)($area['page']??0) || !$uid || $uid!==get_current_user_id()) return $caps;
    $page=get_post($id);
    if ($page && $page->post_type==='page' && $page->post_status==='private' && unanym_has_membership($area['organisation']??'')) return ['read'];
    return $caps; // Native editors/admins retain their existing WordPress authority.
},20,4);
// A routine edit cannot accidentally publish the configured private page.
add_filter('wp_insert_post_data',function($data,$postarr){
    if (!empty($postarr['ID']) && (int)$postarr['ID']===(int)(unanym_member_area()['page']??0)
        && $data['post_type']==='page' && $data['post_status']==='publish') $data['post_status']='private';
    return $data;
},20,2);
add_action('template_redirect',function(){
    $area=unanym_member_area();$id=(int)($area['page']??0);
    if (!$id || ((int)get_query_var('page_id')!==$id && (int)get_queried_object_id()!==$id)) return;
    nocache_headers();if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE',true);
    if (!is_user_logged_in() || !current_user_can('read_post',$id)) {
        $message='<p>This page needs an approved membership shared with this website.</p><p><a href="'.esc_url(add_query_arg('unanym_share','1',home_url('/'))).'">Sign in or update sharing</a></p>';
        wp_die($message,'Membership required',['response'=>403]);
    }
},0);
