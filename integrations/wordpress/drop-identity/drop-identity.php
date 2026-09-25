<?php
/**
 * Plugin Name: Unanym for community websites
 * Description: Guided Unanym setup, PKCE, explicit account linking and connection checks for OpenID Connect Generic Client.
 * Version: 0.3.1
 * Requires PHP: 8.1
 * Requires Plugins: daggerhart-openid-connect-generic
 */
if (!defined('ABSPATH')) exit;
require_once __DIR__.'/memberships.php';
require_once __DIR__.'/member-area.php';

function drop_identity_config() { return get_option('drop_identity_config', []); }
function drop_identity_name() { return drop_identity_config()['display_name']??'FRRN'; }
function drop_identity_local() { return wp_get_environment_type() === 'local'; }
function drop_identity_http($url, $args = []) {
    $args = array_merge(['timeout'=>8, 'redirection'=>0], $args);
    if (drop_identity_local() && in_array(wp_parse_url($url, PHP_URL_HOST), ['localhost','127.0.0.1'], true)) return wp_remote_request($url, $args);
    return wp_safe_remote_request($url, $args);
}
function drop_identity_error($message, $code=403) { wp_die(esc_html($message), esc_html(drop_identity_name()), ['response'=>$code]); }
function drop_identity_b64($bytes) { return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '='); }
function drop_identity_binding() { return isset($_COOKIE['drop_identity_browser']) ? (string) $_COOKIE['drop_identity_browser'] : ''; }
add_action('init', function() {
    if (!preg_match('/^[a-f0-9]{64}$/D', drop_identity_binding()) && !headers_sent()) {
        $value=bin2hex(random_bytes(32));
        setcookie('drop_identity_browser', $value, ['expires'=>time()+DAY_IN_SECONDS,'path'=>COOKIEPATH ?: '/', 'secure'=>is_ssl(),'httponly'=>true,'samesite'=>'Lax']);
        $_COOKIE['drop_identity_browser']=$value;
    }
}, -5);

add_action('admin_menu', function() { add_options_page('Unanym','Unanym','manage_options','drop-identity','drop_identity_settings'); });
function drop_identity_settings() {
    if (!current_user_can('manage_options')) return;
    $c=drop_identity_config();
    echo '<div class="wrap"><h1>Connect this website to Unanym</h1><p>Your existing WordPress sign-in stays available. Start on a staging copy of your website.</p>';
    echo '<h2>1. Ask the identity operator to register this website</h2><p>Send your website name and this callback address. You will receive a client ID and a private client secret.</p><p><code>'.esc_html(admin_url('admin-ajax.php?action=openid-connect-authorize')).'</code></p>';
    echo '<h2>2. Enter the details you received</h2><form method="post" action="'.esc_url(admin_url('admin-post.php')).'">';
    wp_nonce_field('drop_identity_setup');
    echo '<input type="hidden" name="action" value="drop_identity_setup"><table class="form-table">';
    foreach (['issuer'=>'Identity service address','client_id'=>'Client ID','secret'=>'Client secret'] as $key=>$label) {
        $value=$key==='secret'?'':($c[$key]??'');
        echo '<tr><th><label for="drop-'.$key.'">'.esc_html($label).'</label></th><td><input class="regular-text" id="drop-'.$key.'" name="'.$key.'" type="'.($key==='secret'?'password':'text').'" value="'.esc_attr($value).'" autocomplete="off">';
        if ($key==='secret' && !empty($c['secret'])) echo '<p class="description">A secret is saved. Leave blank to keep it.</p>';
        echo '</td></tr>';
    }
    echo '<tr><th><label for="unanym-organisations">Recognised organisation IDs</label></th><td><textarea id="unanym-organisations" name="organisations" rows="4" class="large-text">'.esc_textarea(implode("\n",$c['organisations']??[])).'</textarea><p class="description">One stable ID per line, supplied by the organisation and operator. Empty means sign-in only. The site recognises operator-attested approvals for these organisations.</p></td></tr>';
    echo '</table>';submit_button('Check and save connection');echo '</form>';
    if ($c) echo '<p><strong>Settings saved.</strong> Open your sign-in page in a private browser window and choose Continue with '.esc_html(drop_identity_name()).'.</p>';
    if (!empty($c['membership_key']['kid'])) echo '<p>Operator membership key fingerprint: <code>'.esc_html($c['membership_key']['kid']).'</code>. Confirm it with the operator.</p>';
    unanym_member_area_settings();
    echo '<h2>4. Test before inviting members</h2><ol><li>Use a fictional Unanym account. Choose a name and leave memberships private.</li><li>Check that the new WordPress user is a Subscriber with no email address.</li><li>Disconnect this website at Unanym, then reload a signed-in page. The Unanym session here must end.</li><li>Confirm your ordinary administrator sign-in still works.</li></ol>';
    echo '<h2>Existing members</h2><p>They should sign in with their existing WordPress account first, open Profile and choose Connect this account to '.esc_html(drop_identity_name()).'. Accounts are never matched by name or email.</p>';
    echo '<h2>Email and access</h2><p>Unanym does not send email addresses. New accounts have no email address. Members can add one directly in their WordPress profile for site messages and password recovery. New Unanym accounts receive the Subscriber role; this does not confirm training or grant access to a private community.</p>';
    echo '<p>A Unanym connection lasts at most seven days. Each signed-in request checks access; a disconnected session ends on its next request. Service outages temporarily block Unanym sessions. Ordinary WordPress sessions remain usable. Do not cache signed-in pages.</p></div>';
}
add_action('admin_post_drop_identity_setup', function() {
    if (!current_user_can('manage_options')) drop_identity_error('Administrator access required.');
    check_admin_referer('drop_identity_setup');
    if (!class_exists('OpenID_Connect_Generic')) drop_identity_error('Install and activate OpenID Connect Generic Client first.');
    if (is_multisite()) drop_identity_error('This pilot supports single-site WordPress only.');
    $old=drop_identity_config();
    $issuer=rtrim(trim(wp_unslash($_POST['issuer']??'')), '/');$id=trim(wp_unslash($_POST['client_id']??''));$secret=trim(wp_unslash($_POST['secret']??''));
    if ($secret==='') $secret=$old['secret']??'';
    $parts=wp_parse_url($issuer);
    if (!$parts || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment']) || (($parts['scheme']??'')!=='https' && !(drop_identity_local() && ($parts['scheme']??'')==='http' && in_array($parts['host']??'',['localhost','127.0.0.1'],true)))) drop_identity_error('Use the HTTPS identity service address supplied by the operator.');
    if (!preg_match('/^[a-z0-9-]{2,60}$/D',$id) || strlen($secret)<32) drop_identity_error('Check the client ID and secret supplied by the operator.');
    if ($old && (($old['issuer']??'')!==$issuer || ($old['client_id']??'')!==$id) && get_users(['meta_key'=>'drop_identity_issuer','number'=>1,'fields'=>'ID'])) drop_identity_error('Existing identities are linked to this issuer and client ID. An explicit account migration is required to change them.');
    $response=drop_identity_http($issuer.'/.well-known/openid-configuration');
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response)!==200) drop_identity_error('Could not reach the identity service. Check the address and try again.');
    $d=json_decode(wp_remote_retrieve_body($response),true);
    if (($d['issuer']??'')!==$issuer || !in_array('S256',$d['code_challenge_methods_supported']??[],true) || !in_array('client_secret_post',$d['token_endpoint_auth_methods_supported']??[],true) || !in_array('refresh_token',$d['grant_types_supported']??[],true)) drop_identity_error('The operator must enable a server-side WordPress client with renewable sessions first.');
    foreach (['authorization_endpoint','token_endpoint','userinfo_endpoint','jwks_uri'] as $key) if (!is_string($d[$key]??null) || !str_starts_with($d[$key],$issuer.'/')) drop_identity_error('Unexpected endpoint in discovery. Ask the operator to check the configuration.');
    $v1=in_array('identity.v1',$d['scopes_supported']??[],true) && in_array('memberships.v1',$d['scopes_supported']??[],true);
    $contract=$v1?'community-v1':'legacy-firn';$membership_key=null;
    if ($old && ($old['contract']??'legacy-firn')!==$contract && get_users(['meta_key'=>'drop_identity_issuer','number'=>1,'fields'=>'ID'])) drop_identity_error('Existing accounts use a different contract. Plan an explicit migration before changing it.');
    $organisations=array_values(array_unique(array_filter(array_map('trim',explode("\n",wp_unslash($_POST['organisations']??''))))));
    if (count($organisations)>50) drop_identity_error('Use at most 50 recognised organisations.');
    foreach ($organisations as $org) if (!preg_match('/^(urn:|https?:\/\/)[^\s]{1,490}$/D',$org)) drop_identity_error('Use the stable organisation IDs supplied by the operator.');
    if ($v1) {
        if (!function_exists('sodium_crypto_sign_verify_detached')) drop_identity_error('Enable PHP Sodium to verify membership statements.');
        $keys=drop_identity_http(preg_replace('#/oidc$#','/membership-keys',$issuer));
        $bundle=is_wp_error($keys)?null:json_decode(wp_remote_retrieve_body($keys),true);
        if (is_wp_error($keys) || wp_remote_retrieve_response_code($keys)!==200 || ($bundle['issuer']??null)!==$issuer || count($bundle['keys']??[])!==1 || !unanym_key_valid($bundle['keys'][0])) drop_identity_error('Could not verify the membership key supplied by this operator.');
        $membership_key=$bundle['keys'][0];
        if (isset($old['membership_key']) && $old['membership_key']['kid']!==$membership_key['kid']) drop_identity_error('The operator signing key changed. Arrange a reviewed key migration before reconnecting.');
    } elseif (!$old) drop_identity_error('New websites require the community-v1 contract. Ask the operator for a community-v1 service.');
    // Member-facing branding is separate from the component name and identity contract.
    $display_name='FRRN';
    $presentation=drop_identity_http(preg_replace('#/oidc$#','/presentation',$issuer));
    if (!is_wp_error($presentation) && wp_remote_retrieve_response_code($presentation)===200) {
        $appearance=json_decode(wp_remote_retrieve_body($presentation),true);
        if (is_string($appearance['display_name']??null) && strlen($appearance['display_name'])<=240 && !preg_match('/[\x00-\x1f\x7f]/',$appearance['display_name'])) $display_name=sanitize_text_field($appearance['display_name']);
    }
    if ($display_name==='') $display_name='FRRN';
    $settings=['login_type'=>'button','login_button_text'=>'Continue with '.$display_name,'client_id'=>$id,'client_secret'=>$secret,
        'scope'=>$v1?'openid profile identity.v1 memberships.v1 offline_access':'openid profile drop_identity drop_memberships offline_access','endpoint_login'=>$d['authorization_endpoint'],'endpoint_token'=>$d['token_endpoint'],'endpoint_userinfo'=>$d['userinfo_endpoint'],'endpoint_jwks'=>$d['jwks_uri'],'issuer'=>$issuer,
        'endpoint_end_session'=>'','identity_key'=>'sub','nickname_key'=>'name','displayname_format'=>'{name}',
        // Satisfy the generic formatter, then discard this non-deliverable value before user creation.
        'email_format'=>'{sub}@identity.invalid','link_existing_users'=>0,'identify_with_username'=>0,'create_if_does_not_exist'=>1,
        'token_refresh_enable'=>0,'enable_logging'=>0,'no_sslverify'=>0,'allow_internal_idp'=>drop_identity_local()?1:0,'state_time_limit'=>600,'alternate_redirect_uri'=>0,'redirect_user_back'=>0];
    update_option('openid_connect_generic_settings',$settings,false);
    update_option('drop_identity_config',['issuer'=>$issuer,'client_id'=>$id,'secret'=>$secret,'contract'=>$contract,'display_name'=>$display_name,'membership_key'=>$membership_key,'organisations'=>$organisations,'token_endpoint'=>$d['token_endpoint'],'userinfo_endpoint'=>$d['userinfo_endpoint']],false);
    wp_safe_redirect(admin_url('options-general.php?page=drop-identity'));exit;
});

// Add PKCE, nonce and a browser binding to the maintained plugin's state flow.
add_filter('openid-connect-generic-new-state-value',function($value){
    if (!drop_identity_config()) return $value;
    $state=array_key_first($value);$verifier=drop_identity_b64(random_bytes(32));
    $entry=['verifier'=>$verifier,'nonce'=>bin2hex(random_bytes(32)),'browser'=>hash('sha256',drop_identity_binding())];
    if (!empty($GLOBALS['drop_identity_linking'])) {
        $entry['user']=get_current_user_id();$entry['session']=hash('sha256',wp_get_session_token());
    }
    set_transient('drop_identity_state_'.$state,$entry,600);return $value;
});
add_filter('openid-connect-generic-auth-url',function($url){
    if (!drop_identity_config()) return $url;
    parse_str(wp_parse_url($url,PHP_URL_QUERY)??'', $q);$state=$q['state']??'';$v=get_transient('drop_identity_state_'.$state);
    if (!$v) drop_identity_error('Please reload the sign-in page and try again.');
    return add_query_arg(['code_challenge'=>drop_identity_b64(hash('sha256',$v['verifier'],true)),'code_challenge_method'=>'S256','nonce'=>$v['nonce'],'prompt'=>'consent'],$url);
});
add_filter('openid-connect-generic-alter-request',function($request,$operation){
    if (!drop_identity_config() || $operation!=='get-authentication-token') return $request;
    $state=isset($_GET['state']) && is_string($_GET['state']) ? wp_unslash($_GET['state']) : '';
    if (!preg_match('/^[a-f0-9]{32}$/D',$state)) drop_identity_error('This sign-in request could not be verified. Start again.');
    $v=get_transient('drop_identity_state_'.$state);delete_transient('drop_identity_state_'.$state);
    if (!$v || !hash_equals($v['browser'],hash('sha256',drop_identity_binding()))) drop_identity_error('This sign-in started in a different browser or expired. Start again here.');
    if (isset($v['user']) && ($v['user']!==get_current_user_id() || !hash_equals($v['session'],hash('sha256',wp_get_session_token())))) drop_identity_error('Your WordPress sign-in changed. Start account linking again.');
    $GLOBALS['drop_identity_auth']=$v;$request['body']['code_verifier']=$v['verifier'];return $request;
},20,2);
add_filter('openid-connect-modify-token-response-before-validation',function($tokens){ if (drop_identity_config() && is_array($tokens)) $GLOBALS['drop_identity_tokens']=$tokens;return $tokens; });
add_filter('openid-connect-modify-id-token-claim-before-validation',function($claim){
    if (!drop_identity_config() || is_wp_error($claim)) return $claim;
    $auth=$GLOBALS['drop_identity_auth']??null;
    if (!$auth || !is_string($claim['nonce']??null) || !hash_equals($auth['nonce'],$claim['nonce'])) return new WP_Error('drop-nonce','Sign-in could not be verified. Start again.');
    return $claim;
});
add_filter('openid-connect-generic-user-login-test',function($allowed,$claim){
    $c=drop_identity_config();if (!$c) return $allowed;
    $auth=$GLOBALS['drop_identity_auth']??null;$sub=$claim['sub']??null;
    if (!$allowed || !$auth || !is_string($sub) || !$sub) return false;
    $matched=get_users(['meta_key'=>'openid-connect-generic-subject-identity','meta_value'=>$sub,'number'=>2]);
    if (count($matched)>1) return false;
    foreach ($matched as $user) if (get_user_meta($user->ID,'drop_identity_issuer',true)!==$c['issuer']) return false;
    if (isset($auth['user'])) {
        $uid=$auth['user'];$old=get_user_option('openid-connect-generic-subject-identity',$uid);
        if (($matched && $matched[0]->ID!==$uid) || ($old && $old!==$sub)) drop_identity_error('These accounts already have a different connection. Nothing was changed.');
        update_user_option($uid,'openid-connect-generic-subject-identity',$sub,true);
        update_user_meta($uid,'drop_identity_issuer',$c['issuer']);
    }
    $GLOBALS['drop_identity_subject']=$sub;return true;
},20,2);
add_filter('openid-connect-generic-alter-user-data',function($data){
    if (drop_identity_config()) {$data['user_email']='';$data['role']='subscriber';}return $data;
});
add_action('openid-connect-generic-update-user-using-current-claim',function($user,$claim){
    if (drop_identity_config() && is_string($claim['name']??null) && trim($claim['name'])!=='') wp_update_user(['ID'=>$user->ID,'display_name'=>$claim['name'],'nickname'=>$claim['name']]);
},10,2);
add_action('openid-connect-generic-user-create',function($user){if (drop_identity_config()) update_user_meta($user->ID,'drop_identity_issuer',drop_identity_config()['issuer']);});
add_filter('attach_session_information',function($info,$uid){
    $t=$GLOBALS['drop_identity_tokens']??null;$sub=$GLOBALS['drop_identity_subject']??null;
    if ($t && $sub && get_user_option('openid-connect-generic-subject-identity',$uid)===$sub && get_user_meta($uid,'drop_identity_issuer',true)===drop_identity_config()['issuer']) $info['drop_identity']=['access'=>$t['access_token'],'refresh'=>$t['refresh_token']??'', 'expires'=>time()+(int)($t['expires_in']??0),'until'=>time()+7*DAY_IN_SECONDS,'sub'=>$sub,'issuer'=>drop_identity_config()['issuer']];
    return $info;
},10,2);

// Explicit linking proves control of the existing WP session and the Unanym account.
add_action('show_user_profile',function($user){
    if (!drop_identity_config()) return;
    $brand=esc_html(drop_identity_name());
    echo '<h2>'.$brand.' sign-in</h2><p>Connect this sign-in to your existing account. Your WordPress roles, email and content stay with this account.</p>';
    if (get_user_option('openid-connect-generic-subject-identity',$user->ID)) echo '<p>This account is connected to '.$brand.'.</p>';
    else echo '<p><a class="button" href="'.esc_url(wp_nonce_url(admin_url('admin-post.php?action=drop_identity_link'),'drop_identity_link')).'">Connect this account to '.$brand.'</a></p>';
    if (!$user->user_email) echo '<p>No email address was shared. Add one above only if you want this website to send you email.</p>';
});
add_action('admin_post_drop_identity_link',function(){
    if (!is_user_logged_in()) drop_identity_error('Sign in to your existing WordPress account first.');
    check_admin_referer('drop_identity_link');$GLOBALS['drop_identity_linking']=true;
    $url=do_shortcode('[openid_connect_generic_auth_url]');
    if (!str_starts_with($url,drop_identity_config()['issuer'].'/')) drop_identity_error('The sign-in plugin is not ready. Ask the site administrator.');
    wp_redirect($url);exit;
});

// Only sessions established through Unanym are affected. Native WP admin access survives.
add_action('init',function(){
    if (!drop_identity_config() || !is_user_logged_in() || (defined('WP_CLI') && WP_CLI) || (($_GET['action']??'')==='openid-connect-authorize')) return;
    $uid=get_current_user_id();$manager=WP_Session_Tokens::get_instance($uid);$cookie=wp_get_session_token();$session=$manager->get($cookie);$d=$session['drop_identity']??null;
    if (!$d) return;
    $c=drop_identity_config();
    if ($d['issuer']!==$c['issuer'] || $d['until']<=time()) drop_identity_end_session();
    if ($d['expires']<=time()+15) {
        if (empty($d['refresh'])) drop_identity_end_session();
        $lock='drop_identity_refresh_'.hash('sha256',$cookie);
        if (!add_option($lock,time(),'','no')) {
            if ((int)get_option($lock)<time()-30) delete_option($lock);
            drop_identity_error('Your sign-in is updating. Reload this page in a moment.',503);
        }
        $held=true;$release=function() use ($lock,&$held) { if ($held) { delete_option($lock);$held=false; } };
        register_shutdown_function($release);
        try {
            $r=drop_identity_http($c['token_endpoint'],['method'=>'POST','body'=>['grant_type'=>'refresh_token','refresh_token'=>$d['refresh'],'client_id'=>$c['client_id'],'client_secret'=>$c['secret']]]);
            if (is_wp_error($r) || wp_remote_retrieve_response_code($r)>=500) drop_identity_error(drop_identity_name().' is temporarily unavailable. Please try again shortly.',503);
            if (wp_remote_retrieve_response_code($r)!==200) drop_identity_end_session();
            $t=json_decode(wp_remote_retrieve_body($r),true);
            if (!is_string($t['access_token']??null)) drop_identity_error(drop_identity_name().' returned an unexpected response. Please try again.',503);
            $d['access']=$t['access_token'];$d['refresh']=$t['refresh_token']??$d['refresh'];$d['expires']=time()+(int)($t['expires_in']??0);
            $session['drop_identity']=$d;$manager->update($cookie,$session);
        } finally { $release(); }
    }
    $r=drop_identity_http($c['userinfo_endpoint'],['headers'=>['Authorization'=>'Bearer '.$d['access']]]);
    if (is_wp_error($r) || wp_remote_retrieve_response_code($r)>=500 || wp_remote_retrieve_response_code($r)===429) drop_identity_error(drop_identity_name().' is temporarily unavailable. Your account is safe; please try again shortly.',503);
    if (wp_remote_retrieve_response_code($r)!==200) drop_identity_end_session();
    $claim=json_decode(wp_remote_retrieve_body($r),true);
    if (($claim['sub']??null)!==$d['sub']) drop_identity_end_session();
    if (($c['contract']??'legacy-firn')==='community-v1') {
        try {$GLOBALS['unanym_current_memberships']=unanym_memberships($claim['memberships_v1']??null,$d['sub'],$c);}
        catch (RuntimeException $e) {drop_identity_error('Membership could not be verified. Please contact the website administrator.',503);}
    } else $GLOBALS['drop_identity_current_memberships']=$claim['drop_memberships']??[];
    nocache_headers();
},1);
function drop_identity_end_session() {
    wp_logout();wp_safe_redirect(add_query_arg('drop_disconnected','1',wp_login_url()));exit;
}
add_filter('login_message',function($message){
    if (isset($_GET['drop_disconnected'])) $message.='<p class="message">Your '.esc_html(drop_identity_name()).' connection ended. Continue with '.esc_html(drop_identity_name()).' to connect again, or use your ordinary WordPress sign-in.</p>';
    return $message;
});

// A calm member landing page; the ordinary WordPress admin screens stay familiar.
add_filter('openid-connect-generic-client-redirect-to',function($url){
    if (!drop_identity_config()) return $url;
    return add_query_arg('drop_member','1',home_url('/'));
});
add_action('login_enqueue_scripts',function(){
    if (drop_identity_config()) wp_enqueue_style('drop-identity-member',plugins_url('member.css',__FILE__),[], '0.2.0');
});
add_filter('login_message',function($message){return drop_identity_config()?$message.'<p class="drop-quiet">Or use your existing password for this website below.</p>':$message;},20);
add_filter('login_headerurl',function($url){return drop_identity_config()?home_url('/'):$url;});
add_filter('login_headertext',function($text){return drop_identity_config()?get_bloginfo('name'):$text;});
add_action('template_redirect',function(){
    if (!isset($_GET['drop_member']) || !drop_identity_config()) return;
    if (!is_user_logged_in()) {wp_safe_redirect(wp_login_url(add_query_arg('drop_member','1',home_url('/'))));exit;}
    $user=wp_get_current_user();nocache_headers();
    ?><!doctype html><html <?php language_attributes(); ?>><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title><?php echo esc_html(get_bloginfo('name')); ?> — Your sign-in</title><link rel="stylesheet" href="<?php echo esc_url(plugins_url('member.css',__FILE__)); ?>"></head><body class="drop-member"><header><a href="<?php echo esc_url(home_url('/')); ?>"><?php echo esc_html(get_bloginfo('name')); ?></a></header><main><p class="drop-eyebrow">Your community website</p><h1>Welcome, <?php echo esc_html($user->display_name); ?>.</h1><p class="drop-lead">You’re signed in.</p><section class="drop-card"><h2>Your choice of what to share</h2><p>Your sign-in email address stays private. You can review your sharing choices or disconnect this website at any time.</p><a class="drop-button" href="<?php echo esc_url(home_url('/')); ?>">Visit the website <span aria-hidden="true">→</span></a><?php if ($member_area=unanym_member_area_url()) { ?><p><a class="drop-button" href="<?php echo esc_url($member_area); ?>">Open member area</a></p><?php } ?><p><a href="<?php echo esc_url(preg_replace('#/oidc$#','/sites',drop_identity_config()['issuer'])); ?>">Manage what I share</a></p></section><p class="drop-quiet">Signing in does not confirm training or change this community’s membership rules.</p><footer><a href="<?php echo esc_url(wp_logout_url(home_url('/'))); ?>">Sign out of this website</a><a href="<?php echo esc_url(admin_url('profile.php')); ?>">Account details</a></footer></main></body></html><?php
    exit;
});
