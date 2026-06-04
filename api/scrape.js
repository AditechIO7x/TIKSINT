export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ success: false, error: 'Parameter username wajib diisi.' });
    }

    const targetUser = username.replace('@', '').trim();

    try {
        const response = await fetch(`https://www.tiktok.com/@${targetUser}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ 
                success: false, 
                error: `TikTok merespons dengan status: ${response.status}` 
            });
        }

        const html = await response.text();
        const regex = /<script id="__UNIVERSAL_DATA_FOR_WEB_URL__" type="application\/json">([\s\S]*?)<\/script>/;
        let match = html.match(regex);
        
        let rawJson = '';
        if (match && match[1]) {
            rawJson = match[1];
        } else {
            const backupRegex = /<script id="SIGI_STATE" type="application\/json">([\s\S]*?)<\/script>/;
            const backupMatch = html.match(backupRegex);
            if (backupMatch && backupMatch[1]) {
                rawJson = backupMatch[1];
            }
        }

        if (!rawJson) {
            return res.status(404).json({ 
                success: false, 
                error: 'Sistem proteksi TikTok memblokir pencarian otomatis.' 
            });
        }

        const parsedData = JSON.parse(rawJson);
        
        function deepSearch(obj, key) {
            let visited = new Set();
            function scan(current) {
                if (!current || typeof current !== 'object' || visited.has(current)) return null;
                visited.add(current);
                if (current.hasOwnProperty(key) && current[key] !== undefined) return current;
                for (let k in current) {
                    if (current.hasOwnProperty(k)) {
                        let found = scan(current[k]);
                        if (found) return found;
                    }
                }
                return null;
            }
            return scan(obj);
        }

        const userData = deepSearch(parsedData, 'uniqueId');
        const statsData = deepSearch(parsedData, 'followerCount');

        if (!userData) {
            return res.status(404).json({ success: false, error: 'Profil tidak ditemukan.' });
        }

        let createdDate = "N/A";
        let createdTimestamp = "N/A";
        if (userData.id) {
            try {
                const snowflakeId = BigInt(userData.id);
                const epochSec = Number(snowflakeId >> 32n);
                createdTimestamp = epochSec;
                createdDate = new Date(epochSec * 1000).toISOString();
            } catch (e) {}
        }

        const convertEpoch = (epoch) => epoch && epoch > 0 ? new Date(epoch * 1000).toISOString() : "N/A";

        const osintPayload = {
            "username": userData.uniqueId || "N/A",
            "nickname": userData.nickname || "N/A",
            "user_id": userData.id || "N/A",
            "sec_uid": userData.secUid || "N/A",
            "region": userData.region || "N/A",
            "account_created_at": createdDate,
            "account_created_timestamp": createdTimestamp,
            "last_nickname_modified_at": convertEpoch(userData.nickNameModifyTime),
            "last_username_modified_at": convertEpoch(userData.uniqueIdModifyTime),
            "is_verified": !!userData.verified,
            "is_private": !!(userData.privateAccount || userData.secret),
            "followers_count": statsData ? statsData.followerCount : 0,
            "following_count": statsData ? statsData.followingCount : 0,
            "total_hearts_received": statsData ? statsData.heartCount : 0,
            "videos_count": statsData ? statsData.videoCount : 0,
            "total_liked_by_user": statsData ? statsData.diggCount : 0,
            "bio_signature": userData.signature || "",
            "bio_link_url": userData.bioLink?.link || "N/A",
            "avatar_hd_url": userData.avatarLarger || userData.avatarMedium || "N/A",
            "is_favorites_tab_public": !!userData.openFavorite
        };

        return res.status(200).json({ success: true, metrics: osintPayload });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
              }
