<?php
// Optional introduction statements. Separate signed type; never grants membership.
if (!defined('ABSPATH')) exit;
function unanym_confirmations($claim,$subject,$config,$now=null) {
    $now=$now??time();$result=[];$key=$config['membership_key']??null;
    if (!function_exists('sodium_crypto_sign_verify_detached') || !unanym_key_valid($key) || !unanym_exact($claim,['version','statements']) || $claim['version']!==1 || !is_array($claim['statements']) || !array_is_list($claim['statements']) || count($claim['statements'])>50) throw new RuntimeException('Invalid confirmation response');
    foreach ($claim['statements'] as $jwt) {
        if (!is_string($jwt) || strlen($jwt)>8192) throw new RuntimeException('Invalid confirmation statement');
        $parts=explode('.',$jwt);if(count($parts)!==3) throw new RuntimeException('Invalid confirmation statement');
        [$head,$body,$signature]=array_map('unanym_decode',$parts);
        $h=$head===false?null:json_decode($head,true);$p=$body===false?null:json_decode($body,true);
        if (!unanym_exact($h,['typ','alg','kid']) || $h['typ']!=='community-confirmation+jwt' || $h['alg']!=='EdDSA' || $h['kid']!==$key['kid'] || $signature===false || strlen($signature)!==64 || !sodium_crypto_sign_verify_detached($signature,$parts[0].'.'.$parts[1],unanym_decode($key['x']))) throw new RuntimeException('Invalid confirmation signature');
        if (!unanym_exact($p,['ver','iss','sub','aud','iat','nbf','exp','jti','organisation','confirmation','authority']) || $p['ver']!==1 || $p['iss']!==$config['issuer'] || $p['sub']!==$subject || $p['aud']!==$config['client_id'] || !is_int($p['iat']) || !is_int($p['nbf']) || !is_int($p['exp']) || $p['iat']!==$p['nbf'] || $p['iat']>$now || $p['exp']<=$now || $p['exp']<=$p['iat'] || $p['exp']>$p['iat']+300 || !is_string($p['jti']) || $p['jti']==='') throw new RuntimeException('Invalid confirmation binding');
        $o=$p['organisation'];$m=$p['confirmation'];
        if (!unanym_exact($o,['id','name']) || !is_string($o['id']) || !preg_match('/^(urn:|https?:\/\/)/D',$o['id']) || !is_string($o['name']) || $o['name']==='' || strlen($o['name'])>480 || !unanym_exact($m,['kind','status','confirmed_at','valid_until']) || $m['kind']!=='community_introduction' || $m['status']!=='confirmed' || !unanym_exact($p['authority'],['mode']) || $p['authority']['mode']!=='operator_attested') throw new RuntimeException('Invalid confirmation authority');
        foreach (['confirmed_at','valid_until'] as $field) {
            if ($field==='valid_until' && $m[$field]===null) continue;
            if (!is_string($m[$field]) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/D',$m[$field]) || strtotime($m[$field])===false) throw new RuntimeException('Invalid confirmation date');
        }
        if (strtotime($m['confirmed_at'])>$p['iat']+1 || ($m['valid_until']!==null && strtotime($m['valid_until'])<$p['exp'])) throw new RuntimeException('Invalid confirmation lifetime');
        // A valid signature is not permission. Only explicitly recognised organisations count.
        if (in_array($o['id'],$config['organisations']??[],true)) $result[]=$p;
    }
    return $result;
}
