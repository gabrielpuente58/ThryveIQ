# This will handle lojic for creating certain zones when users initially use the app. 


def heart_rate_zones(lthr):
    return {
        "zone 1": (lthr * .81),
        "zone 2": (lthr * .81-.89),
        "zone 3": (lthr * .90-.93),
        "zone 4": (lthr * .94-.99),
        "zone 5": lthr
    }

def bike_power_zones(ftp):
    return {
        "zone 1": (ftp * .55),
        "zone 2": (ftp * .56-.75),
        "zone 3": (ftp * .76-.90),
        "zone 4": (ftp * .91-1.05),
        "zone 5": (ftp * 1.06-1.20),
        "zone 6": (ftp * 1.21-1.50),
        "zone 7": ftp
    }

